// public/js/dashboard.js (v4 - fixed sector/role + improved WA export)

import { db } from "./firebase-init.js";
import { loginEmailPassword, logout, watchAuth } from "./auth.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const el = (id) => document.getElementById(id);

const dashStatus = el("dashStatus");
const loginStatus = el("loginStatus");

const daysSelect = el("daysBack");
const customRange = el("customDateRange");
const dateFrom = el("dateFrom");
const dateTo = el("dateTo");

const waTextEl = el("waText");

Chart.defaults.color = "rgba(255,255,255,0.92)";
Chart.defaults.font.family = "system-ui, -apple-system, Segoe UI, Roboto, Arial";
Chart.defaults.font.size = 13;

const SECTORS = ["אלון מורה", "איתמר", "ברכה", "לב השומרון"];
const OTHER_LABEL = "אחרים";

const charts = new Map();
let lastAgg = null;

// ----------------------
// Utilities
// ----------------------

function isoDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
  return toDateMaybe(d?.eventAt) || toDateMaybe(d?.createdAt);
}

function normalizeRole(v) {
  return String(v || "")
    .trim()
    .replace(/[״“”]/g, '"');
}

function readRole(data) {
  return normalizeRole(data?.role || data?.meta?.role);
}

function readSector(data) {
  return String(data?.sector || data?.meta?.sector || "").trim();
}

// ----------------------
// Auth
// ----------------------

watchAuth((u) => {
  ["loginBtn", "loginBtnInline"].forEach((id) =>
    el(id)?.classList.toggle("hidden", !!u)
  );
  ["logoutBtn", "logoutBtnInline"].forEach((id) =>
    el(id)?.classList.toggle("hidden", !u)
  );
  if (loginStatus)
    loginStatus.textContent = u
      ? `✅ מחובר: ${u.email || "anonymous"}`
      : "🔒 לא מחובר";
});

async function doLogin() {
  try {
    loginStatus.textContent = "מתחבר...";
    const email = el("adminEmail")?.value?.trim();
    const pass = el("adminPass")?.value;
    await loginEmailPassword(email, pass);
    loginStatus.textContent = "✅ התחברת";
  } catch (e) {
    console.error(e);
    loginStatus.textContent = "❌ התחברות נכשלה";
  }
}

async function doLogout() {
  await logout();
  loginStatus.textContent = "התנתקת";
  charts.forEach((c) => c.destroy());
  charts.clear();
  el("table").textContent = "";
  dashStatus.textContent = "";
  lastAgg = null;
}

el("loginBtn")?.addEventListener("click", doLogin);
el("logoutBtn")?.addEventListener("click", doLogout);

// ----------------------
// Data Fetch
// ----------------------

async function fetchAllReviews(maxDocs = 5000) {
  const all = [];
  let cursor = null;

  while (all.length < maxDocs) {
    const parts = [
      collection(db, "reviews"),
      orderBy("createdAt", "desc"),
      limit(500),
    ];
    if (cursor) parts.splice(parts.length - 1, 0, startAfter(cursor));
    const qRef = query(...parts);
    const snap = await getDocs(qRef);

    snap.docs.forEach((d) =>
      all.push({ id: d.id, data: d.data() })
    );

    if (snap.docs.length < 500) break;
    cursor = snap.docs[snap.docs.length - 1];
  }

  return all;
}

// ----------------------
// Aggregate
// ----------------------

function aggregate(docs, { fromDate, toDateEnd }) {
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

    const sector = readSector(data);
    if (!SECTORS.includes(sector)) continue;

    const type = data?.type || "לא ידוע";
    const role = readRole(data);
    const isTzmm = role === 'צמ"מ';

    typesSet.add(type);
    const bucket = bySector[sector];

    if (!bucket.byType[type])
      bucket.byType[type] = { tzmm: 0, other: 0 };

    if (isTzmm) {
      bucket.byType[type].tzmm++;
      bucket.totals.tzmm++;
    } else {
      bucket.byType[type].other++;
      bucket.totals.other++;
    }

    kept++;
  }

  return { bySector, types: [...typesSet].sort(), kept };
}

// ----------------------
// Charts
// ----------------------

function renderChartForSector(canvasId, sectorName, labels, countsByType) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  charts.get(canvasId)?.destroy();

  const chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: 'צמ"מ',
          data: labels.map((t) => countsByType[t]?.tzmm || 0),
          stack: "s",
        },
        {
          label: OTHER_LABEL,
          data: labels.map((t) => countsByType[t]?.other || 0),
          stack: "s",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
    },
  });

  charts.set(canvasId, chart);
}

// ----------------------
// WhatsApp
// ----------------------

function buildWhatsappText(agg, rangeLabel) {
  let totalTzmm = 0;
  let totalOther = 0;

  for (const sector of SECTORS) {
    const sec = agg.bySector[sector];
    totalTzmm += sec.totals.tzmm;
    totalOther += sec.totals.other;
  }

  const grand = totalTzmm + totalOther;
  const lines = [];

  lines.push(`📊 סטאטוס ביקורות/תרגילים`);
  lines.push(`🗓️ ${rangeLabel}`);
  lines.push(`🦉 ${totalTzmm} | 🪖 ${totalOther}  (סה"כ ${grand})`);
  lines.push("");

  for (const sector of SECTORS) {
    const sec = agg.bySector[sector];
    const tz = sec.totals.tzmm;
    const ot = sec.totals.other;
    const tot = tz + ot;
    if (!tot) continue;

    lines.push(`📍 *${sector}* — 🦉${tz} | 🪖${ot} (${tot})`);

    for (const t of agg.types) {
      const c = sec.byType[t];
      if (!c) continue;
      const tt = c.tzmm + c.other;
      if (!tt) continue;

      lines.push(`   • ${t}: 🦉${c.tzmm} | 🪖${c.other} (${tt})`);
    }

    lines.push("");
  }

  return lines.join("\n").trim();
}

// ----------------------
// Main Load
// ----------------------

el("loadBtn")?.addEventListener("click", async () => {
  try {
    dashStatus.textContent = "טוען...";
    const docs = await fetchAllReviews();

    const fromDate = new Date(Date.now() - 30 * 86400000);
    const toDateEnd = new Date();

    const agg = aggregate(docs, { fromDate, toDateEnd });
    lastAgg = agg;

    const labels = agg.types.length ? agg.types : ["אין נתונים"];

    SECTORS.forEach((s, i) => {
      renderChartForSector(
        `chart_sector_${i}`,
        s,
        labels,
        agg.bySector[s].byType
      );
    });

    dashStatus.textContent = `✅ נטען ${agg.kept} רשומות`;

  } catch (e) {
    console.error(e);
    dashStatus.textContent = "❌ שגיאה בטעינה";
  }
});

// ----------------------
// WA Export
// ----------------------

el("waExportBtn")?.addEventListener("click", async () => {
  if (!lastAgg) return;

  const txt = buildWhatsappText(lastAgg, "30 ימים אחרונים");
  waTextEl.value = txt;

  await navigator.clipboard.writeText(txt);
  dashStatus.textContent = "📋 הועתק לוואטסאפ";
});
