// public/js/dashboard.js (v5)
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
const typeFilterEl = el("typeFilter");

Chart.defaults.color = "rgba(255,255,255,0.92)";
Chart.defaults.font.family = "system-ui, -apple-system, Segoe UI, Roboto, Arial";
Chart.defaults.font.size = 13;

const SECTORS = ["אלון מורה", "איתמר", "ברכה", "לב השומרון"];
const OTHER_LABEL = "מפקדים";
const charts = new Map();
let lastAgg = null;
let lastRangeLabel = "";

function isoDate(d) { const pad = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function toDateMaybe(ts) { if (!ts) return null; if (typeof ts?.toDate === "function") return ts.toDate(); if (typeof ts === "string") { const d = new Date(ts); return isNaN(d.getTime()) ? null : d; } return null; }
function getEventDate(d) { return toDateMaybe(d?.eventAt) || toDateMaybe(d?.createdAt); }
function normalizeRole(v) { return String(v || "").trim().replace(/[״“”]/g, '"'); }
function readRole(data) { return normalizeRole(data?.role || data?.meta?.role); }
function readSector(data) { return String(data?.sector || data?.meta?.sector || "").trim(); }

watchAuth((u) => {
  ["loginBtn", "loginBtnInline"].forEach((id) => el(id)?.classList.toggle("hidden", !!u));
  ["logoutBtn", "logoutBtnInline"].forEach((id) => el(id)?.classList.toggle("hidden", !u));
  loginStatus.textContent = u ? `✅ מחובר: ${u.email || "anonymous"}` : "🔒 לא מחובר";
});
async function doLogin() { try { loginStatus.textContent = "מתחבר..."; await loginEmailPassword(el("adminEmail")?.value?.trim(), el("adminPass")?.value); loginStatus.textContent = "✅ התחברת"; } catch (e) { console.error(e); loginStatus.textContent = "❌ התחברות נכשלה"; } }
async function doLogout() { await logout(); loginStatus.textContent = "התנתקת"; charts.forEach((c) => c.destroy()); charts.clear(); el("table").textContent = ""; dashStatus.textContent = ""; lastAgg = null; lastRangeLabel = ""; }
el("loginBtn")?.addEventListener("click", doLogin); el("logoutBtn")?.addEventListener("click", doLogout);

async function fetchAllReviews(maxDocs = 5000) {
  const all = []; let cursor = null;
  while (all.length < maxDocs) {
    const parts = [collection(db, "reviews"), orderBy("createdAt", "desc"), limit(500)];
    if (cursor) parts.splice(parts.length - 1, 0, startAfter(cursor));
    const snap = await getDocs(query(...parts));
    snap.docs.forEach((d) => all.push({ id: d.id, data: d.data() }));
    if (snap.docs.length < 500) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return all;
}

function aggregate(docs, { fromDate, toDateEnd, typeFilter }) {
  const bySector = {}; SECTORS.forEach((s) => { bySector[s] = { byType: {}, totals: { tzmm: 0, other: 0 } }; });
  const typesSet = new Set(); let kept = 0;
  for (const { data } of docs) {
    const ev = getEventDate(data); if (!ev) continue; if (fromDate && ev < fromDate) continue; if (toDateEnd && ev > toDateEnd) continue;
    const sector = readSector(data); if (!SECTORS.includes(sector)) continue;
    const type = data?.type || "לא ידוע"; if (typeFilter && type !== typeFilter) continue;
    const isTzmm = readRole(data) === 'צמ"מ' || readRole(data) === 'צמ״מ';
    const bucket = bySector[sector]; typesSet.add(type);
    if (!bucket.byType[type]) bucket.byType[type] = { tzmm: 0, other: 0 };
    if (isTzmm) { bucket.byType[type].tzmm++; bucket.totals.tzmm++; } else { bucket.byType[type].other++; bucket.totals.other++; }
    kept++;
  }
  return { bySector, types: [...typesSet].sort(), kept };
}

function renderChartForSector(canvasId, labels, countsByType) {
  const ctx = document.getElementById(canvasId); if (!ctx) return; charts.get(canvasId)?.destroy();
  const chart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [ { label: 'צמ״מ', data: labels.map((t) => countsByType[t]?.tzmm || 0), stack: "s" }, { label: OTHER_LABEL, data: labels.map((t) => countsByType[t]?.other || 0), stack: "s" } ] },
    options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } },
  });
  charts.set(canvasId, chart);
}

function buildWhatsappText(agg, rangeLabel) {
  let totalTzmm = 0, totalOther = 0; const lines = [];
  for (const sector of SECTORS) { const sec = agg.bySector[sector]; totalTzmm += sec.totals.tzmm; totalOther += sec.totals.other; }
  lines.push(`📊 סטאטוס ביקורות/תרגילים`, `🗓️ ${rangeLabel}`, `🦉 ${totalTzmm} | 🪖 ${totalOther}  (סה"כ ${totalTzmm + totalOther})`, "");
  for (const sector of SECTORS) {
    const sec = agg.bySector[sector]; const tot = sec.totals.tzmm + sec.totals.other; if (!tot) continue;
    lines.push(`📍 *${sector}* — 🦉${sec.totals.tzmm} | 🪖${sec.totals.other} (${tot})`);
    for (const t of agg.types) { const c = sec.byType[t]; if (!c) continue; const tt = c.tzmm + c.other; if (!tt) continue; lines.push(`   • ${t}: 🦉${c.tzmm} | 🪖${c.other} (${tt})`); }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function getDateRange() {
  const today = new Date();
  const mode = daysSelect?.value || '30';
  let fromDate = null, toDateEnd = null, label = '';
  if (mode === 'custom') {
    fromDate = dateFrom?.value ? new Date(`${dateFrom.value}T00:00:00`) : null;
    toDateEnd = dateTo?.value ? new Date(`${dateTo.value}T23:59:59`) : new Date();
    label = `${dateFrom?.value || 'התחלה'} עד ${dateTo?.value || isoDate(today)}`;
  } else {
    const days = Number(mode || 30);
    fromDate = new Date(Date.now() - days * 86400000);
    toDateEnd = new Date();
    label = `${days} ימים אחרונים`;
  }
  return { fromDate, toDateEnd, label };
}

function renderTable(agg) {
  const lines = [];
  for (const sector of SECTORS) {
    const sec = agg.bySector[sector];
    lines.push(`${sector}: צמ״מ ${sec.totals.tzmm} | מפקדים ${sec.totals.other} | סה"כ ${sec.totals.tzmm + sec.totals.other}`);
    for (const t of agg.types) {
      const c = sec.byType[t]; if (!c) continue;
      lines.push(`  - ${t}: צמ״מ ${c.tzmm} | מפקדים ${c.other} | סה"כ ${c.tzmm + c.other}`);
    }
    lines.push('');
  }
  el('table').textContent = lines.join('\n').trim();
}

async function loadDashboard() {
  try {
    dashStatus.textContent = 'טוען...';
    const docs = await fetchAllReviews();
    const { fromDate, toDateEnd, label } = getDateRange();
    const agg = aggregate(docs, { fromDate, toDateEnd, typeFilter: typeFilterEl?.value || '' });
    lastAgg = agg; lastRangeLabel = label;
    const labels = agg.types.length ? agg.types : ['אין נתונים'];
    SECTORS.forEach((s, i) => renderChartForSector(`chart_sector_${i}`, labels, agg.bySector[s].byType));
    renderTable(agg);
    dashStatus.textContent = `✅ נטען ${agg.kept} רשומות (${label})`;
  } catch (e) { console.error(e); dashStatus.textContent = '❌ שגיאה בטעינה'; }
}

function toggleCustomRange() { customRange?.classList.toggle('hidden', daysSelect?.value !== 'custom'); }
daysSelect?.addEventListener('change', toggleCustomRange); toggleCustomRange();
el('loadBtn')?.addEventListener('click', loadDashboard);
el('waExportBtn')?.addEventListener('click', async () => { if (!lastAgg) return; const txt = buildWhatsappText(lastAgg, lastRangeLabel || 'טווח נבחר'); waTextEl.value = txt; try { await navigator.clipboard.writeText(txt); } catch {} dashStatus.textContent = '📋 הועתק לוואטסאפ'; const link='https://wa.me/?text='+encodeURIComponent(txt); el('openWaLink').href = link; });
el('copyWaBtn')?.addEventListener('click', async ()=>{ try { await navigator.clipboard.writeText(waTextEl.value || ''); dashStatus.textContent='📋 הטקסט הועתק'; } catch (e) { console.error(e); } });
