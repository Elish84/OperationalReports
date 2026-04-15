// public/js/dashboard.js (v5)
import { db } from "./firebase-init.js";
import { initGlobalAuthUI, watchAuth } from "./auth.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  where,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { fetchLists, populateSelect } from "./lists.js";

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

let SECTORS = ["אלון מורה", "איתמר", "ברכה", "לב השומרון"]; // Default until loaded
const OTHER_LABEL = "מפקדים";
const OFFENSIVE_TYPE = "סיכום פעילות התקפית ⚔️";
const DRONE_TYPE = "סיכום פעילות רחפן 🚁";
const charts = new Map();
let lastAgg = null;
let lastRangeLabel = "";
let globalLists = null;

const val = (id, defaultVal = "") => el(id)?.value || defaultVal;

function isoDate(d) { const pad = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function toDateMaybe(ts) { if (!ts) return null; if (typeof ts?.toDate === "function") return ts.toDate(); if (typeof ts === "string") { const d = new Date(ts); return isNaN(d.getTime()) ? null : d; } return null; }
function getEventDate(d) { return toDateMaybe(d?.eventAt) || toDateMaybe(d?.createdAt); }
function normalizeRole(v) { return String(v || "").trim().replace(/[״“”]/g, '"'); }
function normalizeType(v) { return String(v || '').replace(' ⚔️', '').replace(' 🚁', '').trim(); }
function readRole(data) { return normalizeRole(data?.role || data?.meta?.role); }
function readSector(data) { return String(data?.sector || data?.meta?.sector || "").trim(); }

initGlobalAuthUI(false);

watchAuth(async (u) => {
  const isRealAdmin = u && !u.isAnonymous;
  if (loginStatus) loginStatus.textContent = isRealAdmin ? `✅ מחובר: ${u.email}` : "🔒 לא מחובר (מצב צפייה)";
  if (isRealAdmin) {
    dashStatus.innerHTML = '✅ מחובר. בחר טווח ולחץ על <b>טען נתונים</b>';
  }
});

async function fetchAllReviews(fromDate = null, maxDocs = 5000) {
  const all = []; let cursor = null;
  const sinceTs = fromDate ? Timestamp.fromDate(fromDate) : null;
  
  while (all.length < maxDocs) {
    const qParts = [collection(db, "reviews"), orderBy("createdAt", "desc"), limit(500)];
    if (sinceTs) qParts.push(where("createdAt", ">=", sinceTs));
    if (cursor) qParts.push(startAfter(cursor));
    
    const snap = await getDocs(query(...qParts));
    snap.docs.forEach((d) => all.push({ id: d.id, data: d.data() }));
    if (dashStatus && all.length > 0) dashStatus.textContent = `טוען רשומות (${all.length})...`;
    if (snap.docs.length < 500) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return all;
}

function aggregate(docs, { fromDate, toDateEnd, typeFilter, obsFilter }) {
  const bySector = {}; SECTORS.forEach((s) => { bySector[s] = { byType: {}, totals: { tzmm: 0, other: 0 } }; });
  const typesSet = new Set(); let kept = 0;
  for (const { data } of docs) {
    const ev = getEventDate(data); if (!ev) continue; if (fromDate && ev < fromDate) continue; if (toDateEnd && ev > toDateEnd) continue;
    const sector = readSector(data); if (!SECTORS.includes(sector)) continue;
    if (obsFilter === 'כל התצפיות') {
      if (!data?.observationsIntegration || data?.observationsIntegration === 'ללא') continue;
    } else if (obsFilter && data?.observationsIntegration !== obsFilter) continue;
    const rawType = data?.type || "לא ידוע";
    let type = rawType;
    if (normalizeType(rawType) === normalizeType(OFFENSIVE_TYPE)) type = OFFENSIVE_TYPE;
    else if (normalizeType(rawType) === normalizeType(DRONE_TYPE)) type = DRONE_TYPE;
    if (typeFilter && normalizeType(type) !== normalizeType(typeFilter)) continue;
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
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: window.innerWidth < 768 ? false : { duration: 1000 },
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } }
    },
  });
  charts.set(canvasId, chart);
}

function renderCommandersBySectorChart(agg) {
  const canvasId = 'chart_commanders_by_sector';
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  charts.get(canvasId)?.destroy();

  const labels = SECTORS;
  const types = agg.types.length ? agg.types : ['אין נתונים'];
  const datasets = types.map((type) => ({
    label: type,
    data: labels.map((sector) => agg.bySector[sector]?.byType?.[type]?.other || 0),
    stack: 'commanders'
  }));

  const chart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: window.innerWidth < 768 ? false : { duration: 1000 },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }
      },
      plugins: {
        legend: { position: 'bottom' }
      }
    }
  });
  charts.set(canvasId, chart);
}

function buildWhatsappText(agg, rangeLabel) {
  let totalTzmm = 0, totalOther = 0; const lines = [];
  for (const sector of SECTORS) { const sec = agg.bySector[sector]; totalTzmm += sec.totals.tzmm; totalOther += sec.totals.other; }
  lines.push(`📊 סטאטוס ביקורות/תרגילים`, `🗓️ ${rangeLabel}`, `🦉 ${totalTzmm} | 🪖 ${totalOther}  (סה"כ ${totalTzmm + totalOther})`, typeFilterEl?.value === OFFENSIVE_TYPE ? "⚔️ סינון: פעילות התקפית בלבד" : "", "");
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
    
    if (!globalLists) {
      globalLists = await fetchLists();
      if (globalLists.sectors && globalLists.sectors.length > 0) {
        // Use dynamically loaded sectors
        SECTORS = globalLists.sectors;
      }
      populateSelect("obsFilter", globalLists.observations, val("obsFilter"), "הכל", { value: "כל התצפיות", text: "כל התצפיות" });
    }
    
    const { fromDate, toDateEnd, label } = getDateRange();
    
    // 60s Timeout for initial fetch
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout (60s)")), 60000));
    const docs = await Promise.race([fetchAllReviews(fromDate), timeout]);

    const obsFilterEl = document.getElementById("obsFilter");
    const agg = aggregate(docs, { fromDate, toDateEnd, typeFilter: typeFilterEl?.value || '', obsFilter: obsFilterEl?.value || '' });
    lastAgg = agg; lastRangeLabel = label;
    const labels = agg.types.length ? agg.types : ['אין נתונים'];
    
    // Wrapped chart rendering in separate try-catch to prevent complete UI death
    try {
      SECTORS.forEach((s, i) => renderChartForSector(`chart_sector_${i}`, labels, agg.bySector[s].byType));
      renderCommandersBySectorChart(agg);
      renderTable(agg);
    } catch (chartErr) {
      console.error("Chart Rendering Error:", chartErr);
    }
    
    dashStatus.textContent = `✅ נטען ${agg.kept} רשומות (${label})`;
  } catch (e) {
    console.error("Dashboard Load Error:", e);
    const retryIcon = '<button class="primary" onclick="window.location.reload()" style="padding:4px 8px;font-size:12px;margin-top:5px">נסה שוב 🔃</button>';
    dashStatus.innerHTML = `❌ שגיאה בטעינה: <br><small>${e.message || e}</small><br>${retryIcon}`;
  }
}

function toggleCustomRange() { customRange?.classList.toggle('hidden', daysSelect?.value !== 'custom'); }
daysSelect?.addEventListener('change', toggleCustomRange); toggleCustomRange();
el('loadBtn')?.addEventListener('click', loadDashboard);
el('waExportBtn')?.addEventListener('click', async () => { if (!lastAgg) return; const txt = buildWhatsappText(lastAgg, lastRangeLabel || 'טווח נבחר'); waTextEl.value = txt; try { await navigator.clipboard.writeText(txt); } catch {} dashStatus.textContent = '📋 הועתק לוואטסאפ'; const link='https://wa.me/?text='+encodeURIComponent(txt); el('openWaLink').href = link; });
el('copyWaBtn')?.addEventListener('click', async ()=>{ try { await navigator.clipboard.writeText(waTextEl.value || ''); dashStatus.textContent='📋 הטקסט הועתק'; } catch (e) { console.error(e); } });
