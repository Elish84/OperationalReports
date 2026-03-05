// public/js/form.js (v2) - FIX: robust DOM reads for non-admin users
import { db } from "./firebase-init.js";
import { ensureAnon } from "./auth.js";
import {
  serverTimestamp,
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { buildWhatsappText, exportPdf } from "./pdf.js";

const el = (id) => document.getElementById(id);
const statusLine = el("statusLine");

// ✅ Safe value getters (prevent null.value crashes)
const val = (id, fallback = "") => (el(id)?.value ?? fallback);
const valTrim = (id, fallback = "") => (el(id)?.value ?? fallback).trim();
const valArr = (ids) => ids.map((id) => valTrim(id)).filter(Boolean);

// Optional debug: identify which fields are missing in non-admin view
function warnMissing(ids) {
  const missing = ids.filter((id) => !el(id));
  if (missing.length) {
    console.warn("[form] Missing elements in DOM (non-fatal):", missing);
  }
}

async function sha256Hex(str) {
  const buf = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") +
    "}"
  );
}

async function saveIfNeeded(baseData) {
  // חשוב: לא כוללים createdAt בתוך ה-hash כדי למנוע כפילויות שווא
  const dataForHash = { ...baseData };
  delete dataForHash.createdAt;

  const hash = await sha256Hex(stableStringify(dataForHash));

  // ✅ ללא קריאה ל-DB (קריאות נחסמות ללוחמים לפי ה-Rules)
  // נשתמש ב-hash בתור docId:
  // - אם המסמך לא קיים: setDoc הוא CREATE ומותר (signedIn)
  // - אם המסמך כבר קיים: setDoc הופך ל-UPDATE ונחסם (רק Admin) => נתייחס כ"כפילות"
  const ref = doc(db, "reviews", hash);

  try {
    await setDoc(ref, { ...baseData, hash }, { merge: false });
    return { id: hash, isDuplicate: false };
  } catch (e) {
    // אם המסמך קיים כבר (update חסום) נקבל permission-denied -> זו כפילות
    if (e?.code === "permission-denied") {
      return { id: hash, isDuplicate: true };
    }
    throw e;
  }
}

function scoreOrNA(v) {
  if (v === "na") return "na";
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function avg(vals) {
  const v = (vals || []).filter((x) => Number.isFinite(x) && x != null);
  if (!v.length) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

function to100(avg5) {
  if (avg5 == null) return null;
  return Math.round((avg5 / 5) * 100);
}

function computeScores(audit) {
  if (!audit) return null;

  const opAvg = avg([
    audit.posSector,
    audit.missionBriefing,
    audit.sectorHistory,
    audit.threatUnderstanding,
    audit.appearance,
    audit.effort,
    audit.drills,
    audit.roe
  ]);

  const techAvg = avg([audit.systems, audit.communication]);
  const intelAvg = avg([audit.intelTools]);
  const medAvg = avg([audit.medical]);

  // משקל יחסי: אם נושא/קבוצה "לא רלוונטיים" – מחלקים מחדש משקל רק בין הקבוצות הרלוונטיות
  const weights = { op: 0.8, tech: 0.1, intel: 0.05, med: 0.05 };

  const parts = [
    { key: "op", avg: opAvg },
    { key: "tech", avg: techAvg },
    { key: "intel", avg: intelAvg },
    { key: "med", avg: medAvg }
  ].filter((p) => p.avg != null);

  if (!parts.length) {
    return {
      overallAvg5: null,
      overall100: null,
      operational100: null,
      tech100: null,
      intel100: null,
      medical100: null
    };
  }

  const totalW = parts.reduce((s, p) => s + weights[p.key], 0);
  const weightedAvg5 = parts.reduce((s, p) => s + p.avg * weights[p.key], 0) / totalW;

  return {
    overallAvg5: Math.round(weightedAvg5 * 10) / 10,
    overall100: to100(weightedAvg5),
    operational100: to100(opAvg),
    tech100: to100(techAvg),
    intel100: to100(intelAvg),
    medical100: to100(medAvg)
  };
}

function collectData() {
  // Debug-only: helps you see what's missing in non-admin DOM
  warnMissing([
    "type",
    "role",
    "name",
    "sector",
    "force",
    "notes",
    "keep1",
    "keep2",
    "keep3",
    "imp1",
    "imp2",
    "imp3",
    // optional on some forms
    "exerciseDescription",
    "gaps",
    // audit fields (present only in audit mode)
    "posSector",
    "missionBriefing",
    "sectorHistory",
    "threatUnderstanding",
    "appearance",
    "effort",
    "drills",
    "roe",
    "systems",
    "communication",
    "intelTools",
    "medical"
  ]);

  const type = val("type"); // ✅ safe
  const isAudit = type === "ביקורת קצה מבצעי";

  const base = {
    type,
    meta: {
      role: val("role"),
      name: valTrim("name"),
      sector: val("sector"),
      force: valTrim("force")
    },
    // רלוונטי לתרגולים/תרגילים בלבד
    exerciseDescription: valTrim("exerciseDescription"),
    gaps: valTrim("gaps"),
    notes: valTrim("notes"),
    keep: valArr(["keep1", "keep2", "keep3"]),
    improve: valArr(["imp1", "imp2", "imp3"])
  };

  if (!isAudit) {
    base.audit = null;
    base.score = null;
    return base;
  }

  const audit = {
    posSector: scoreOrNA(val("posSector")),
    missionBriefing: scoreOrNA(val("missionBriefing")),
    sectorHistory: scoreOrNA(val("sectorHistory")),
    threatUnderstanding: scoreOrNA(val("threatUnderstanding")),
    appearance: scoreOrNA(val("appearance")),
    effort: scoreOrNA(val("effort")),
    drills: scoreOrNA(val("drills")),
    roe: scoreOrNA(val("roe")),
    systems: scoreOrNA(val("systems")),
    communication: scoreOrNA(val("communication")),
    intelTools: scoreOrNA(val("intelTools")),
    medical: scoreOrNA(val("medical"))
  };

  // NA => null לצורך חישובים
  const norm = {};
  for (const [k, v] of Object.entries(audit)) {
    if (v === "na") norm[k] = null;
    else norm[k] = Number(v);
  }

  base.audit = audit;
  base.score = computeScores(norm);
  return base;
}

async function readPhotosAsDataUrls(files) {
  const arr = [];
  for (const f of files) {
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(f);
    });
    arr.push({ name: f.name, dataUrl });
  }
  return arr;
}

// כפתור מאוחד: שמירה + יצוא לוואטסאפ (העתקה ללוח)
el("saveBtn")?.addEventListener("click", async () => {
  try {
    await ensureAnon();
    const data = collectData();

    data.createdAt = serverTimestamp();
    data.schemaVersion = 4;

    const res = await saveIfNeeded(data);

    const baseTxt = buildWhatsappText(data);
    const txt = baseTxt + `\n\n🆔 מזהה רשומה: ${res.id}`;

    await navigator.clipboard.writeText(txt);

    if (statusLine) {
      statusLine.textContent = res.isDuplicate
        ? `📋 נשמר בעבר (נמנע כפילות) + הועתק לוואטסאפ. מזהה: ${res.id}`
        : `📋 נשמר אוטומטית + הועתק לוואטסאפ. מזהה: ${res.id}`;
    }
  } catch (e) {
    console.error(e);
    if (statusLine) statusLine.textContent = "❌ שמירה/יצוא לוואטסאפ נכשל";
  }
});

el("pdfBtn")?.addEventListener("click", async () => {
  try {
    const data = collectData();
    const files = el("photos")?.files || [];
    const photos = await readPhotosAsDataUrls(files);
    await exportPdf(data, photos);
  } catch (e) {
    console.error(e);
    if (statusLine) statusLine.textContent = "❌ יצוא PDF נכשל";
  }
});
