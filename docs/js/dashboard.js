// public/js/dashboard.js (v3 - 4-sector charts + WhatsApp export)
// FIX: Count "צמ\"מ" strictly by record.role === 'צמ"מ' (not meta.role)
import { db } from "./firebase-init.js";
import { loginEmailPassword, logout, watchAuth } from "./auth.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const el = (id) => document.getElementById(id);

const dashStatus = el("dashStatus");
const loginStatus = el("loginStatus");

const daysSelect = el("daysBack");
const customRange = el("customDateRange");
const dateFrom = el("dateFrom");
const dateTo = el("dateTo");

const waTextEl = el("waText");

// ---- Chart global defaults for brighter readable text ----
Chart.defaults.color = "rgba(255,255,255,0.92)";
Chart.defaults.font.family = "system-ui, -apple-system, Segoe UI, Roboto, Arial";
Chart.defaults.font.size = 13;

const SECTORS = ["אלון מורה", "איתמר", "ברכה", "לב השומרון"]; // 4 graphs
const OTHER_LABEL = "אחרים";
const TZ_NOTE = "(שעון מקומי)";

const charts = new Map();
let lastAgg = null; // for WA export

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

function onClick(id, handler) {
  const node = el(id);
  if (node) node.addEventListener("click", handler);
}

function fillSelect(id, values, keepValue = true) {
  const select = el(id);
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">הכל</option>`;
  [...values]
    .filter(Boolean)
    .sort()
    .forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });

  if (keepValue && current) {
    const exists = [...select.options].some((o) => o.value === current);
    select.value = exists ? current : "";
  } else {
    select.value = "";
  }
}

function toDateMaybe(ts) {
  if (!ts) return null;
  if (typeof ts?.toDate === "function") return ts.toDate();
  if (typeof ts === "string") {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function getEventDate(d) {
  // prefer manually set eventAt, fallback to createdAt
  return toDateMaybe(d?.eventAt) || toDateMaybe(d?.createdAt);
}

function renderChartForSector(canvasId, sectorName, labels, countsByType) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const existing = charts.get(canvasId);
  if (existing) existing.destroy();

  const dataTzmm = labels.map((t) => countsByType?.[t]?.tzmm || 0);
  const dataOther = labels.map((t) => countsByType?.[t]?.other || 0);

  const chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: 'צמ"מ',
          data: dataTzmm,
          borderWidth: 1,
          borderRadius: 10,
          barPercentage: 0.72,
          categoryPercentage: 0.72,
          stack: "stack0",
        },
        {
          label: OTHER_LABEL,
          data: dataOther,
          borderWidth: 1,
          borderRadius: 10,
          barPercentage: 0.72,
          categoryPercentage: 0.72,
          stack: "stack0",
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
          display: true,
          text: `גזרה: ${sectorName}`,
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
          stacked: true,
          ticks: {
            color: "rgba(255,255,255,0.88)",
            maxRotation: 0,
            autoSkip: true,
          },
          grid: { display: false },
        },
        y: {
          stacked: true,
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

  charts.set(canvasId, chart);
}

function renderCountsTable(agg) {
  // Flatten for human reading
  const lines = [];
  for (const sector of SECTORS) {
    const sec = agg.bySector[sector] || { byType: {}, totals: { tzmm: 0, other: 0 } };
    const total = (sec.totals.tzmm || 0) + (sec.totals.other || 0);
    lines.push(`📍 ${sector} — צמ"מ: ${sec.totals.tzmm || 0} | אחרים: ${sec.totals.other || 0} | סה"כ: ${total}`);
    for (const t of agg.types) {
      const c = sec.byType[t] || { tzmm: 0, other: 0 };
      const tt = (c.tzmm || 0) + (c.other || 0);
      if (tt === 0) continue;
      lines.push(`   • ${t}: צמ"מ ${c.tzmm || 0} | אחרים ${c.other || 0} | סה"כ ${tt}`);
    }
    lines.push("");
  }
  el("table").textContent = lines.join("\n").trim() || "אין נתונים";
}

function emojiForTotal(n) {
  if (n >= 10) return "🟢";
  if (n >= 5) return "✅";
  if (n >= 2) return "⚠️";
  if (n >= 1) return "🔴";
  return "⛔";
}

function buildWhatsappText(agg) {
  const lines = [];

  // ---- Global totals ----
  let totalTzmm = 0;
  let totalOther = 0;

  for (const sector of SECTORS) {
    const sec = agg.bySector[sector];
    if (!sec) continue;
    totalTzmm += sec.totals.tzmm || 0;
    totalOther += sec.totals.other || 0;
  }

  const grandTotal = totalTzmm + totalOther;

  lines.push(`📊 סטאטוס ביקורות/תרגילים`);
  lines.push(`🗓️ ${agg.rangeLabel}`);
  lines.push(`🦉 צמ"מ: ${totalTzmm} | 🪖 אחרים: ${totalOther}  (סה"כ ${grandTotal})`);
  lines.push(`מפתח: 🦉 צמ"מ | 🪖 שאר הכוחות`);
  lines.push("");

  // ---- Per sector ----
  for (const sector of SECTORS) {
    const sec = agg.bySector[sector];
    if (!sec) continue;

    const tz = sec.totals.tzmm || 0;
    const ot = sec.totals.other || 0;
    const total = tz + ot;

    if (total === 0) continue;

    // Sector summary line
    lines.push(`📍 *${sector}* — 🦉${tz} | 🪖${ot}  (${total})`);

    // Per type breakdown (only if exists)
    for (const t of agg.types) {
      const c = sec.byType[t];
      if (!c) continue;

      const tt = (c.tzmm || 0) + (c.other || 0);
      if (tt === 0) continue;

      lines.push(`   • ${t}: 🦉${c.tzmm || 0} | 🪖${c.other || 0}  (${tt})`);
    }

    lines.push("");
  }

  lines.push("(נמשך מהדשבורד)");

  return lines.join("\n").trim();
}

function setWaTextAndLink(txt) {
  if (waTextEl) waTextEl.value = txt;
  const link = el("openWaLink");
  if (link) {
    const encoded = encodeURIComponent(txt);
    link.href = `https://wa.me/?text=${encoded}`;
  }
}

async function copyToClipboard(txt) {
  try {
    await navigator.clipboard.writeText(txt);
    return true;
  } catch {
    return false;
  }
}

// ---- Auth watch ----
watchAuth((u) => {
  ["loginBtn", "loginBtnInline"].forEach((id) => el(id)?.classList.toggle("hidden", !!u));
  ["logoutBtn", "logoutBtnInline"].forEach((id) => el(id)?.classList.toggle("hidden", !u));
  if (loginStatus) loginStatus.textContent = u ? `✅ מחובר: ${u.email || "anonymous"}` : "🔒 לא מחובר";
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
  charts.forEach((c) => c.destroy());
  charts.clear();
  lastAgg = null;
  setWaTextAndLink("");
}

onClick("loginBtn", doLogin);
onClick("loginBtnInline", doLogin);
onClick("logoutBtn", doLogout);
onClick("logoutBtnInline", doLogout);

// ---- Data fetch (paged) ----
async function fetchAllReviews(maxDocs = 5000) {
  const all = [];
  let cursor = null;
  while (all.length < maxDocs) {
    const parts = [collection(db, "reviews"), orderBy("createdAt", "desc"), limit(500)];
    if (cursor) parts.splice(parts.length - 1, 0, startAfter(cursor));
    const qRef = query(...parts);
    const snap = await getDocs(qRef);
    snap.docs.forEach((d) => all.push({ id: d.id, data: d.data() }));
    if (snap.docs.length < 500) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return all;
}

function computeRange() {
  let fromDate;
  let toDateEnd = null;
  let rangeLabel;

  if (daysSelect.value === "custom") {
    setDefaultCustomDates();
    const from = new Date(dateFrom.value);
    const to = dateTo.value ? new Date(dateTo.value) : new Date();
    to.setHours(23, 59, 59, 999);
    if (isNaN(from.getTime())) throw new Error("טווח מותאם: תאריך-מ־לא תקין");
    fromDate = from;
    toDateEnd = to;
    rangeLabel = `${dateFrom.value} עד ${dateTo.value || isoDate(new Date())}`;
  } else {
    const days = Number(daysSelect.value);
    fromDate = new Date(Date.now() - days * 86400000);
    rangeLabel = `${daysSelect.value} ימים אחרונים`;
  }

  return { fromDate, toDateEnd, rangeLabel };
}
function normalizeRole(v) {
  return String(v || "")
    .trim()
    // normalize Hebrew / smart quotes to regular double quote
    .replace(/[״“”]/g, '"');
}

function readRole(data) {
  // support both schemas: role on root OR under meta.role
  return normalizeRole(data?.role || data?.meta?.role);
}
// ✅ FIXED: role is on root: data.role
function aggregate(docs, { fromDate, toDateEnd, typeFilter }) {
  const bySector = {};
  SECTORS.forEach((s) => {
    bySector[s] = { byType: {}, totals: { tzmm: 0, other: 0 } };
  });

  const typesSet = new Set();
  let kept = 0;

  for (const { data } of docs) {
    const ev = getEventDate(data);
    if (!ev) continue;
    if (ev < fromDate) continue;
    if (toDateEnd && ev > toDateEnd) continue;

    const sector = data?.meta?.sector || "";
    if (!SECTORS.includes(sector)) continue;

    const type = data?.type || "לא ידוע";
    if (typeFilter && type !== typeFilter) continue;

    // 🔧 strict definition: tzmm <=> role === 'צמ"מ'
   const role = readRole(data);
    if (kept < 5) {
  console.log("SAMPLE role root:", data?.role, "meta:", data?.meta?.role);
}
    const isTzmm = role === 'צמ"מ';

    typesSet.add(type);
    const bucket = bySector[sector];
    if (!bucket.byType[type]) bucket.byType[type] = { tzmm: 0, other: 0 };

    if (isTzmm) {
      bucket.byType[type].tzmm++;
      bucket.totals.tzmm++;
    } else {
      bucket.byType[type].other++;
      bucket.totals.other++;
    }
    kept++;
  }

  const types = [...typesSet].sort();
  return { bySector, types, kept };
}

function populateTypeFilterFromDocs(docs) {
  const types = new Set();
  docs.forEach(({ data }) => {
    if (data?.type) types.add(data.type);
  });
  fillSelect("typeFilter", types);
}

// ---- Main load ----
onClick("loadBtn", async () => {
  try {
    dashStatus.textContent = "טוען...";

    const typeFilter = el("typeFilter")?.value || "";

    const range = computeRange();
    const docs = await fetchAllReviews(5000);
    populateTypeFilterFromDocs(docs);

    const agg0 = aggregate(docs, { ...range, typeFilter });
    lastAgg = {
      ...agg0,
      rangeLabel: range.rangeLabel,
      typeFilter: typeFilter || "",
      fetched: docs.length,
    };

    // render charts
    const labels = lastAgg.types.length ? lastAgg.types : ["אין נתונים"];
    SECTORS.forEach((sector, idx) => {
      renderChartForSector(`chart_sector_${idx}`, sector, labels, lastAgg.bySector[sector]?.byType || {});
    });

    renderCountsTable(lastAgg);

    dashStatus.textContent = `✅ נטען · ${range.rangeLabel} · לאחר סינון: ${lastAgg.kept} רשומות (נמשכו ${lastAgg.fetched})`;
  } catch (e) {
    console.error(e);
    dashStatus.textContent = `❌ אין הרשאה (אתה לא admin) / תקלה${e?.message ? ` · ${e.message}` : ""}`;
  }
});

// ---- WhatsApp export ----
onClick("waExportBtn", async () => {
  if (!lastAgg) {
    dashStatus.textContent = "ℹ️ קודם טען סטטיסטיקות ואז יצא לוואטסאפ";
    return;
  }
  const txt = buildWhatsappText(lastAgg);
  setWaTextAndLink(txt);
  const ok = await copyToClipboard(txt);
  dashStatus.textContent = ok ? "📋 הטקסט הועתק (אפשר להדביק בוואטסאפ או ללחוץ 'פתח וואטסאפ')" : "ℹ️ הטקסט נוצר. אם לא הועתק אוטומטית — סמן והעתק ידנית.";
});

onClick("copyWaBtn", async () => {
  const txt = waTextEl?.value || "";
  if (!txt) return;
  const ok = await copyToClipboard(txt);
  dashStatus.textContent = ok ? "📋 הועתק" : "❌ לא הצלחתי להעתיק (בדוק הרשאות דפדפן)";
});
