// public/js/form.js (v3)
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

const val = (id, fallback = "") => (el(id)?.value ?? fallback);
const valTrim = (id, fallback = "") => (el(id)?.value ?? fallback).trim();
const checked = (id) => !!el(id)?.checked;
const valArr = (ids) => ids.map((id) => valTrim(id)).filter(Boolean);

const AUDIT_TYPE = "ביקורת קצה מבצעי";
const HQ_TYPE = "ביקורת חמ״ל";
const OFFENSIVE_TYPE = "סיכום פעילות התקפית ⚔️";

function warnMissing(ids) {
  const missing = ids.filter((id) => !el(id));
  if (missing.length) console.warn("[form] Missing elements in DOM (non-fatal):", missing);
}

function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);
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
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

async function saveIfNeeded(baseData) {
  const dataForHash = { ...baseData };
  delete dataForHash.createdAt;

  const hash = await sha256Hex(stableStringify(dataForHash));
  const ref = doc(db, "reviews", hash);

  try {
    await setDoc(ref, { ...baseData, hash }, { merge: false });
    return { id: hash, isDuplicate: false };
  } catch (e) {
    if (e?.code === "permission-denied") {
      return { id: hash, isDuplicate: true };
    }
    throw e;
  }
}

function scoreOrNA(v) {
  if (v === "na") return "na";
  if (v === "" || v === undefined || v === null) return null;
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return null;
  return n;
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

function computeAuditScores(audit) {
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

  const weights = { op: 0.8, tech: 0.1, intel: 0.05, med: 0.05 };
  const parts = [
    { key: "op", avg: opAvg },
    { key: "tech", avg: techAvg },
    { key: "intel", avg: intelAvg },
    { key: "med", avg: medAvg }
  ].filter((p) => p.avg != null);

  if (!parts.length) {
    return {
      mode: "audit",
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
    mode: "audit",
    overallAvg5: Math.round(weightedAvg5 * 10) / 10,
    overall100: to100(weightedAvg5),
    operational100: to100(opAvg),
    tech100: to100(techAvg),
    intel100: to100(intelAvg),
    medical100: to100(medAvg)
  };
}

function computeHqScores(hqAudit) {
  if (!hqAudit) return null;
  const routineAvg = avg([hqAudit.logDocumentation, hqAudit.shiftHandoverQuality]);
  const drillAvg = avg([
    hqAudit.professionalKnowledge,
    hqAudit.situationalAwareness,
    hqAudit.commonPictureTransfer,
    hqAudit.medicalAndCasualties,
    hqAudit.connectivity,
    hqAudit.sectorKnowledge,
    hqAudit.forceActivation,
    hqAudit.neighborInterface
  ]);

  const weights = { routine: 0.25, drill: 0.75 };
  const parts = [
    { key: "routine", avg: routineAvg },
    { key: "drill", avg: drillAvg }
  ].filter((p) => p.avg != null);

  if (!parts.length) {
    return {
      mode: "hq",
      overallAvg5: null,
      overall100: null,
      routine100: null,
      drill100: null
    };
  }

  const totalW = parts.reduce((s, p) => s + weights[p.key], 0);
  const weightedAvg5 = parts.reduce((s, p) => s + p.avg * weights[p.key], 0) / totalW;

  return {
    mode: "hq",
    overallAvg5: Math.round(weightedAvg5 * 10) / 10,
    overall100: to100(weightedAvg5),
    routine100: to100(routineAvg),
    drill100: to100(drillAvg)
  };
}

function normalizeForScore(obj) {
  const norm = {};
  for (const [k, v] of Object.entries(obj || {})) {
    norm[k] = v === "na" ? null : Number(v);
  }
  return norm;
}

function collectData() {
  warnMissing([
    "type", "role", "name", "sector", "force", "notes", "keep1", "keep2", "keep3", "imp1", "imp2", "imp3",
    "off_keep_proc_1", "off_keep_proc_2", "off_keep_proc_3", "off_imp_proc_1", "off_imp_proc_2", "off_imp_proc_3",
    "off_keep_manage_1", "off_keep_manage_2", "off_keep_manage_3", "off_imp_manage_1", "off_imp_manage_2", "off_imp_manage_3",
    "exerciseDescription", "offMissionType", "offLocationType", "r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10", "r11", "r12",
    "hq_r1", "hq_r2", "hq_r3", "hq_r4", "hq_r5", "hq_r6", "hq_r7", "hq_r8", "hq_r9", "hq_r10", "hq_outline", "hq_exerciseEvaluation"
  ]);

  const type = val("type");
  const isAudit = type === AUDIT_TYPE;
  const isHq = type === HQ_TYPE;
  const isOffensive = type === OFFENSIVE_TYPE;

  const base = {
    type,
    meta: {
      role: val("role"),
      name: valTrim("name"),
      sector: val("sector"),
      force: valTrim("force")
    },
    exerciseDescription: isOffensive ? "" : valTrim("exerciseDescription"),
    notes: valTrim("notes"),
    keep: isOffensive ? [] : valArr(["keep1", "keep2", "keep3"]),
    improve: isOffensive ? [] : valArr(["imp1", "imp2", "imp3"]),
    offensiveSummary: isOffensive ? {
      missionType: val("offMissionType"),
      locationType: val("offLocationType"),
      battleProcedure: {
        keep: valArr(["off_keep_proc_1", "off_keep_proc_2", "off_keep_proc_3"]),
        improve: valArr(["off_imp_proc_1", "off_imp_proc_2", "off_imp_proc_3"])
      },
      battleManagement: {
        keep: valArr(["off_keep_manage_1", "off_keep_manage_2", "off_keep_manage_3"]),
        improve: valArr(["off_imp_manage_1", "off_imp_manage_2", "off_imp_manage_3"])
      }
    } : null,
    audit: null,
    hqAudit: null,
    score: null
  };

  if (isOffensive) return base;
  if (!isAudit && !isHq) return base;

  if (isAudit) {
    const audit = {
      posSector: scoreOrNA(val("r1")),
      missionBriefing: scoreOrNA(val("r2")),
      sectorHistory: scoreOrNA(val("r3")),
      threatUnderstanding: scoreOrNA(val("r4")),
      appearance: scoreOrNA(val("r5")),
      effort: scoreOrNA(val("r6")),
      drills: scoreOrNA(val("r7")),
      roe: scoreOrNA(val("r8")),
      systems: scoreOrNA(val("r9")),
      communication: scoreOrNA(val("r10")),
      intelTools: scoreOrNA(val("r11")),
      medical: scoreOrNA(val("r12")),
      forceTraining: {
        trained: val("forceTrained"),
        trainingType: val("forceTrainingType")
      }
    };
    base.audit = audit;
    base.score = computeAuditScores(normalizeForScore({
      posSector: audit.posSector,
      missionBriefing: audit.missionBriefing,
      sectorHistory: audit.sectorHistory,
      threatUnderstanding: audit.threatUnderstanding,
      appearance: audit.appearance,
      effort: audit.effort,
      drills: audit.drills,
      roe: audit.roe,
      systems: audit.systems,
      communication: audit.communication,
      intelTools: audit.intelTools,
      medical: audit.medical
    }));
    return base;
  }

  const hqAudit = {
    items: {
      shabzak: checked("hq_item_shabzak"),
      initiatedPage: checked("hq_item_initiated"),
      settlementMaps: checked("hq_item_maps"),
      crownsProcedure: checked("hq_item_crowns"),
      optionsProcedure: checked("hq_item_options"),
      orders: checked("hq_item_orders"),
      hardCommunication: checked("hq_item_comm"),
      radioAndMasoah: checked("hq_item_radio"),
      campDefenseFiles: checked("hq_item_defense")
    },
    logDocumentation: scoreOrNA(val("hq_r1")),
    shiftHandoverQuality: scoreOrNA(val("hq_r2")),
    exerciseOutline: valTrim("hq_outline"),
    exerciseEvaluation: valTrim("hq_exerciseEvaluation"),
    professionalKnowledge: scoreOrNA(val("hq_r3")),
    situationalAwareness: scoreOrNA(val("hq_r4")),
    commonPictureTransfer: scoreOrNA(val("hq_r5")),
    medicalAndCasualties: scoreOrNA(val("hq_r6")),
    connectivity: scoreOrNA(val("hq_r7")),
    sectorKnowledge: scoreOrNA(val("hq_r8")),
    forceActivation: scoreOrNA(val("hq_r9")),
    neighborInterface: scoreOrNA(val("hq_r10"))
  };

  base.hqAudit = hqAudit;
  base.score = computeHqScores(normalizeForScore({
    logDocumentation: hqAudit.logDocumentation,
    shiftHandoverQuality: hqAudit.shiftHandoverQuality,
    professionalKnowledge: hqAudit.professionalKnowledge,
    situationalAwareness: hqAudit.situationalAwareness,
    commonPictureTransfer: hqAudit.commonPictureTransfer,
    medicalAndCasualties: hqAudit.medicalAndCasualties,
    connectivity: hqAudit.connectivity,
    sectorKnowledge: hqAudit.sectorKnowledge,
    forceActivation: hqAudit.forceActivation,
    neighborInterface: hqAudit.neighborInterface
  }));
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

el("saveBtn")?.addEventListener("click", async () => {
  const shouldPreopen = isMobile();
  const waWindow = shouldPreopen ? window.open("about:blank", "_blank") : null;

  try {
    await ensureAnon();
    const data = collectData();
    data.createdAt = serverTimestamp();
    data.schemaVersion = 7;

    const res = await saveIfNeeded(data);
    const txt = buildWhatsappText(data);
    const waUrl = "https://wa.me/?text=" + encodeURIComponent(txt);

    try { await navigator.clipboard.writeText(txt); } catch (err) { console.warn("[form] Clipboard failed:", err); }

    if (waWindow && !waWindow.closed) waWindow.location.href = waUrl;
    else window.location.href = waUrl;

    if (statusLine) {
      statusLine.textContent = res.isDuplicate
        ? `📲 נשמר בעבר (נמנע כפילות). נפתח וואטסאפ… מזהה: ${res.id}`
        : `📲 נשמר. נפתח וואטסאפ… מזהה: ${res.id}`;
    }
  } catch (e) {
    console.error(e);
    try { if (waWindow && !waWindow.closed) waWindow.close(); } catch (_) {}
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
