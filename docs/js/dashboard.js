// public/js/dashboard.js
// v4 - supports:
// - strict צמ"מ counting
// - practical drill inside "ביקורת קצה מבצעי" also counted as "תרגול משימה"

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
const DRILL_LABEL = "תרגול משימה";

const charts = new Map();
let lastAgg = null;

/* ==============================
   Helpers
================================ */

function normalizeRole(v) {
  return String(v || "")
    .trim()
    .replace(/[״“”]/g, '"');
}

function readRole(data) {
  return normalizeRole(data?.role || data?.meta?.role);
}

function isPracticalDrill(data) {
  const v =
    data?.sections?.training?.kind ||
    data?.sections?.forceTraining?.kind ||
    data?.meta?.trainingKind ||
    data?.trainingKind ||
    data?.forceTrainingType;

  return String(v || "").trim() === "מעשי";
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

/* ==============================
   Aggregation
================================ */

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

    const baseType = data?.type || "לא ידוע";
    if (typeFilter && baseType !== typeFilter) continue;

    const role = readRole(data);
    const isTzmm = role === 'צמ"מ';

    const bucket = bySector[sector];
    if (!bucket.byType[baseType]) {
      bucket.byType[baseType] = { tzmm: 0, other: 0 };
    }

    // ספירה רגילה
    if (isTzmm) {
      bucket.byType[baseType].tzmm++;
      bucket.totals.tzmm++;
    } else {
      bucket.byType[baseType].other++;
      bucket.totals.other++;
    }

    typesSet.add(baseType);

    // 🔥 לוגיקה חדשה:
    // אם זו ביקורת קצה מבצעי ויש תרגול מעשי → נספור גם כתרגול משימה
    if (baseType === "ביקורת קצה מבצעי" && isPracticalDrill(data)) {
      if (!bucket.byType[DRILL_LABEL]) {
        bucket.byType[DRILL_LABEL] = { tzmm: 0, other: 0 };
      }

      if (isTzmm) {
        bucket.byType[DRILL_LABEL].tzmm++;
      } else {
        bucket.byType[DRILL_LABEL].other++;
      }

      typesSet.add(DRILL_LABEL);
    }

    kept++;
  }

  return { bySector, types: [...typesSet].sort(), kept };
}

/* ==============================
   Data Fetch
================================ */

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

    snap.docs.forEach((d) => all.push({ id: d.id, data: d.data() }));
    if (snap.docs.length < 500) break;

    cursor = snap.docs[snap.docs.length - 1];
  }

  return all;
}

/* ==============================
   Load button
================================ */

document.getElementById("loadBtn")?.addEventListener("click", async () => {
  try {
    dashStatus.textContent = "טוען...";

    const typeFilter = el("typeFilter")?.value || "";
    const fromDate = new Date(Date.now() - 30 * 86400000);

    const docs = await fetchAllReviews(5000);

    const agg0 = aggregate(docs, { fromDate, typeFilter });
    lastAgg = {
      ...agg0,
      fetched: docs.length,
    };

    dashStatus.textContent = `✅ נטען · ${lastAgg.kept} רשומות`;

  } catch (e) {
    console.error(e);
    dashStatus.textContent = "❌ שגיאה בטעינת נתונים";
  }
});