// public/js/dashboard.js
import { db } from "./firebase-init.js";
import { loginEmailPassword, logout, watchAuth } from "./auth.js";
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const el = (id) => document.getElementById(id);

const dashStatus = el("dashStatus");
const loginStatus = el("loginStatus");

const daysSelect = el("daysBack");
const customRange = el("customDateRange");
const dateFrom = el("dateFrom");
const dateTo = el("dateTo");

let chart;

// ---- Chart global defaults for brighter readable text ----
Chart.defaults.color = "rgba(255,255,255,0.92)";
Chart.defaults.font.family = "system-ui, -apple-system, Segoe UI, Roboto, Arial";
Chart.defaults.font.size = 13;

// ---- UI: toggle custom date range ----
function isoDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function setDefaultCustomDates() {
  const now = new Date();
  const from = new Date(Date.now() - 30 * 86400000);
  if (dateFrom && !dateFrom.value) dateFrom.value = isoDate(from);
  if (dateTo && !dateTo.value) dateTo.value = isoDate(now);
}

if (daysSelect && customRange) {
  daysSelect.addEventListener("change", () => {
    const isCustom = daysSelect.value === "custom";
    customRange.classList.toggle("hidden", !isCustom);
    if (isCustom) setDefaultCustomDates();
  });
}

// ---- Helpers ----
function renderTable(obj) {
  const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  el("table").textContent =
    entries.map(([k, v]) => `${k}: ${v}`).join("\n") || "אין נתונים";
}

function renderChart(labels, values, titleText) {
  const ctx = document.getElementById("chart");
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "כמות",
          data: values,
          borderWidth: 1,
          borderRadius: 10,
          barPercentage: 0.72,
          categoryPercentage: 0.72,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      layout: { padding: { top: 10, right: 10, bottom: 6, left: 10 } },
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            color: "rgba(255,255,255,0.92)",
            boxWidth: 14,
            boxHeight: 14,
            padding: 14,
          },
        },
        title: {
          display: !!titleText,
          text: titleText || "",
          color: "rgba(255,255,255,0.92)",
          font: { size: 14, weight: "600" },
          padding: { top: 6, bottom: 10 },
        },
        tooltip: {
          intersect: false,
          mode: "index",
          backgroundColor: "rgba(10,14,24,0.92)",
          titleColor: "rgba(255,255,255,0.95)",
          bodyColor: "rgba(255,255,255,0.92)",
          borderColor: "rgba(255,255,255,0.10)",
          borderWidth: 1,
          padding: 10,
        },
      },
      scales: {
        x: {
          ticks: {
            color: "rgba(255,255,255,0.88)",
            maxRotation: 0,
            autoSkip: true,
          },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            color: "rgba(255,255,255,0.88)",
          },
          grid: {
            color: "rgba(255,255,255,0.08)",
          },
        },
      },
    },
  });
}

function onClick(id, handler) {
  const node = el(id);
  if (node) node.addEventListener("click", handler);
}

function fillSelect(id, values, keepValue = true) {
  const select = el(id);
  if (!select) return;
  const current = select.value;

  select.innerHTML = `<option value="">הכל</option>`;
  [...values].sort().forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });

  if (keepValue && current) {
    // keep only if still exists, otherwise fallback to "all"
    const exists = [...select.options].some((o) => o.value === current);
    select.value = exists ? current : "";
  } else {
    select.value = "";
  }
}

function populateFilters(docs) {
  const sectors = new Set();
  const types = new Set();
  const roles = new Set();

  docs.forEach((doc) => {
    const d = doc.data() || {};
    if (d.meta?.sector) sectors.add(d.meta.sector);
    if (d.type) types.add(d.type);
    if (d.meta?.role) roles.add(d.meta.role);
  });

  fillSelect("sectorFilter", sectors);
  fillSelect("typeFilter", types);
  fillSelect("roleFilter", roles);
}

function toDateMaybe(ts) {
  // Firestore Timestamp → Date ; ISO string → Date ; fallback null
  if (!ts) return null;
  if (typeof ts?.toDate === "function") return ts.toDate();
  if (typeof ts === "string") {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// ---- Auth watch ----
watchAuth((u) => {
  ["loginBtn", "loginBtnInline"].forEach((id) =>
    el(id)?.classList.toggle("hidden", !!u)
  );
  ["logoutBtn", "logoutBtnInline"].forEach((id) =>
    el(id)?.classList.toggle("hidden", !u)
  );

  if (loginStatus) {
    loginStatus.textContent = u ? `✅ מחובר: ${u.email || "anonymous"}` : "🔒 לא מחובר";
  }
});

// ---- Login/logout ----
async function doLogin() {
  try {
    if (loginStatus) loginStatus.textContent = "מתחבר...";
    const email = el("adminEmail")?.value?.trim();
    const pass = el("adminPass")?.value;

    if (!email || !pass) {
      if (loginStatus) loginStatus.textContent = "❌ חסר אימייל או סיסמה";
      return;
    }

    await loginEmailPassword(email, pass);
    if (loginStatus) loginStatus.textContent = "✅ התחברת. אפשר לטעון סטטיסטיקות.";
  } catch (e) {
    console.error(e);
    if (loginStatus) loginStatus.textContent = "❌ התחברות נכשלה (בדוק אימייל/סיסמה)";
  }
}

async function doLogout() {
  await logout();
  if (loginStatus) loginStatus.textContent = "התנתקת";
  dashStatus.textContent = "";
  el("table").textContent = "";
  if (chart) chart.destroy();
}

onClick("loginBtn", doLogin);
onClick("loginBtnInline", doLogin);
onClick("logoutBtn", doLogout);
onClick("logoutBtnInline", doLogout);

// ---- Main load ----
onClick("loadBtn", async () => {
  try {
    dashStatus.textContent = "טוען...";

    const groupBy = el("groupBy").value;

    const sectorFilter = el("sectorFilter")?.value || "";
    const typeFilter = el("typeFilter")?.value || "";
    const roleFilter = el("roleFilter")?.value || "";

    // timeframe (we query >= since; we do end-date filter client-side to avoid composite index needs)
    let since;
    let until = null;

    if (daysSelect.value === "custom") {
      setDefaultCustomDates();

      const from = new Date(dateFrom.value);
      const to = dateTo.value ? new Date(dateTo.value) : new Date();
      to.setHours(23, 59, 59, 999);

      if (isNaN(from.getTime())) {
        dashStatus.textContent = "❌ טווח מותאם: תאריך-מ־לא תקין";
        return;
      }

      since = Timestamp.fromDate(from);
      until = to;
    } else {
      const days = Number(daysSelect.value);
      since = Timestamp.fromDate(new Date(Date.now() - days * 86400000));
    }

    // Firestore read (protected by Rules: read only for admins)
    const qRef = query(collection(db, "reviews"), where("createdAt", ">=", since));
    const snap = await getDocs(qRef);

    // Populate dropdown options dynamically from the loaded slice
    populateFilters(snap.docs);

    const counts = {};
    let kept = 0;

    snap.forEach((doc) => {
      const d = doc.data() || {};

      // end-date filter client-side (only when custom)
      if (until) {
        const created = toDateMaybe(d.createdAt);
        if (created && created > until) return;
      }

      if (sectorFilter && (d.meta?.sector || "") !== sectorFilter) return;
      if (typeFilter && (d.type || "") !== typeFilter) return;
      if (roleFilter && (d.meta?.role || "") !== roleFilter) return;

      let key = "לא ידוע";
      if (groupBy === "type") key = d.type || "לא ידוע";
      if (groupBy === "sector") key = d.meta?.sector || "לא ידוע";
      if (groupBy === "role") key = d.meta?.role || "לא ידוע";
      if (groupBy === "name") key = d.meta?.name || "לא ידוע";

      counts[key] = (counts[key] || 0) + 1;
      kept++;
    });

    renderTable(counts);

    const labels = Object.keys(counts);
    const values = Object.values(counts);

    const titleParts = [];
    if (sectorFilter) titleParts.push(`גזרה: ${sectorFilter}`);
    if (typeFilter) titleParts.push(`סוג: ${typeFilter}`);
    if (roleFilter) titleParts.push(`תפקיד: ${roleFilter}`);

    const titleText =
      titleParts.length
        ? `תוצאות לפי ${el("groupBy").selectedOptions[0].textContent} · ${titleParts.join(" · ")}`
        : `תוצאות לפי ${el("groupBy").selectedOptions[0].textContent}`;

    renderChart(labels, values, titleText);

    const tfText =
      daysSelect.value === "custom"
        ? `טווח מותאם (${dateFrom.value} עד ${dateTo.value || isoDate(new Date())})`
        : `${daysSelect.value} ימים אחרונים`;

    dashStatus.textContent = `✅ נטען · ${tfText} · לאחר סינון: ${kept} רשומות (מתוך ${snap.size} שנמשכו)`;
  } catch (e) {
    console.error(e);
    dashStatus.textContent = "❌ אין הרשאה (אתה לא admin) / תקלה";
  }
});
