// public/js/form.js (v3)
import { db } from "./firebase-init.js";
import { ensureAnon } from "./auth.js";
import {
  serverTimestamp,
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { buildWhatsappText } from "./pdf.js";
import { fetchLists, populateSelect } from "./lists.js";
import { checkForUpdates } from "./version.js";

const el = (id) => document.getElementById(id);
const statusLine = el("statusLine");

const val = (id, fallback = "") => (el(id)?.value ?? fallback);
const valTrim = (id, fallback = "") => (el(id)?.value ?? fallback).trim();
const checked = (id) => !!el(id)?.checked;
const valArr = (ids) => ids.map((id) => valTrim(id)).filter(Boolean);

const AUDIT_TYPE = "ביקורת קצה מבצעי";
const HQ_TYPE = "ביקורת חמ״ל";
const OFFENSIVE_TYPE = "סיכום פעילות התקפית ⚔️";
const DRONE_TYPE = "סיכום פעילות רחפן 🚁";
let cachedLists = null;

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

const STORAGE_KEY = "8109_form_context";
const DEVICE_ID_KEY = "8109_device_id";
const PROFILE_PREFIX = "8109_device_profile_";

function getOrCreateDeviceId() {
  let devId = localStorage.getItem(DEVICE_ID_KEY);
  if (!devId) {
    devId = (crypto.randomUUID ? crypto.randomUUID() : "dev_" + Date.now() + "_" + Math.random().toString(36).slice(2));
    localStorage.setItem(DEVICE_ID_KEY, devId);
  }
  return devId;
}

function getProfileStorageKey() {
  return PROFILE_PREFIX + getOrCreateDeviceId();
}

function getSavedProfile() {
  const raw = localStorage.getItem(getProfileStorageKey());
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function saveDeviceProfile(profile) {
  localStorage.setItem(getProfileStorageKey(), JSON.stringify({
    deployment: profile.deployment || "",
    sector: profile.sector || "",
    name: (profile.name || "").trim(),
    role: profile.role || ""
  }));
}

function hasProfileChanged(current, saved) {
  if (!saved) return true;
  return (
    (current.deployment || "") !== (saved.deployment || "") ||
    (current.sector || "") !== (saved.sector || "") ||
    (current.name || "").trim() !== (saved.name || "").trim() ||
    (current.role || "") !== (saved.role || "")
  );
}

function applySavedProfileToForm() {
  const saved = getSavedProfile();
  if (!saved) return false;

  if (saved.deployment && el("deployment")) {
    el("deployment").value = saved.deployment;
  }
  updateSectors();

  if (saved.sector && el("sector")) {
    el("sector").value = saved.sector;
  }
  if (saved.role && el("role")) {
    el("role").value = saved.role;
  }
  if (saved.name && el("name")) {
    el("name").value = saved.name;
  }
  return true;
}

function saveContext() {
  const context = {
    role: val("role"),
    name: valTrim("name"),
    sector: val("sector"),
    force: valTrim("force"),
    deployment: val("deployment")
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(context));
}

function resetForm() {
  const ids = [
    "notes", "keep1", "keep2", "keep3", "imp1", "imp2", "imp3",
    "off_keep_proc_1", "off_keep_proc_2", "off_keep_proc_3", "off_imp_proc_1", "off_imp_proc_2", "off_imp_proc_3",
    "off_keep_manage_1", "off_keep_manage_2", "off_keep_manage_3", "off_imp_manage_1", "off_imp_manage_2", "off_imp_manage_3",
    "exerciseDescription", "offMissionType", "offLocationType", "r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10", "r11", "r12",
    "hq_r1", "hq_r2", "hq_r3", "hq_r4", "hq_r5", "hq_r6", "hq_r7", "hq_r8", "hq_r9", "hq_r10", "hq_outline", "hq_exerciseEvaluation",
    "force"
  ];
  ids.forEach(id => {
    const field = el(id);
    if (!field) return;
    if (field.type === "checkbox") field.checked = false;
    else field.value = "";
  });

  // Restore saved device profile if available; otherwise clear personal fields
  if (!applySavedProfileToForm()) {
    ["name", "role", "sector", "deployment"].forEach(id => {
      if (el(id)) el(id).value = "";
    });
  }
  
  // Re-sync UI
  el("type")?.dispatchEvent(new Event("change"));
}

function loadContext() {
  const savedProfile = getSavedProfile();
  const contextStr = localStorage.getItem(STORAGE_KEY);
  let source = null;

  if (contextStr) {
    try { source = JSON.parse(contextStr); } catch (e) {}
  }
  const effective = {
    deployment: source?.deployment || savedProfile?.deployment || "",
    sector: source?.sector || savedProfile?.sector || "",
    role: source?.role || savedProfile?.role || "",
    name: source?.name || savedProfile?.name || "",
    force: source?.force || ""
  };

  if (effective.deployment && el("deployment")) el("deployment").value = effective.deployment;
  updateSectors();
  if (effective.sector && el("sector")) el("sector").value = effective.sector;
  if (effective.role && el("role")) el("role").value = effective.role;
  if (effective.name && el("name")) el("name").value = effective.name;
  if (effective.force && el("force")) el("force").value = effective.force;

  el("type")?.dispatchEvent(new Event("change"));
}

function updateSectors(preferredSector = null) {
  if (!cachedLists) return;
  const depName = val("deployment");
  const depObj = (cachedLists.deployments || []).find(d => (typeof d === 'object' ? d.name : d) === depName);
  
  let sectorsToShow = cachedLists.sectors || [];
  if (depObj && typeof depObj === 'object' && Array.isArray(depObj.sectors)) {
    const validSectors = depObj.sectors.filter(s => s && s.trim() !== "");
    if (validSectors.length > 0) {
      sectorsToShow = validSectors;
    }
  }
  
  const currentSector = preferredSector !== null ? preferredSector : val("sector");
  populateSelect("sector", sectorsToShow, currentSector);
}

async function loadDynamicLists() {
  try {
    const savedProfile = getSavedProfile();
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (e) {}

    const targetDeployment = val("deployment") || draft?.deployment || savedProfile?.deployment || "";
    const targetSector = val("sector") || draft?.sector || savedProfile?.sector || "";
    const targetRole = val("role") || draft?.role || savedProfile?.role || "";
    const targetName = valTrim("name") || draft?.name || savedProfile?.name || "";

    const lists = await fetchLists();
    cachedLists = lists;
    populateSelect("observationsIntegration", lists.observations, val("observationsIntegration"));
    populateSelect("role", lists.roles, targetRole);
    
    const activeDeployments = (lists.deployments || [])
      .filter(d => typeof d === 'object' ? d.active : true)
      .map(d => typeof d === 'object' ? d.name : d);
    populateSelect("deployment", activeDeployments, targetDeployment);
    
    // Filter sectors according to selected deployment and restore target sector
    updateSectors(targetSector);

    if (targetName && el("name")) {
      el("name").value = targetName;
    }
  } catch (err) {
    console.error("Failed loading lists", err);
  }
}

function collectData() {
  warnMissing([
    "type", "role", "name", "sector", "force", "notes", "keep1", "keep2", "keep3", "imp1", "imp2", "imp3",
    "off_keep_proc_1", "off_keep_proc_2", "off_keep_proc_3", "off_imp_proc_1", "off_imp_proc_2", "off_imp_proc_3",
    "off_keep_manage_1", "off_keep_manage_2", "off_keep_manage_3", "off_imp_manage_1", "off_imp_manage_2", "off_imp_manage_3",
    "exerciseDescription", "offMissionType", "offLocationType", "r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10", "r11", "r12",
    "hq_r1", "hq_r2", "hq_r3", "hq_r4", "hq_r5", "hq_r6", "hq_r7", "hq_r8", "hq_r9", "hq_r10", "hq_outline", "hq_exerciseEvaluation",
    "deployment"
  ]);

  const type = val("type");
  const deployment = val("deployment");
  if (!deployment) throw new Error("נא לבחור תעסוקה מבצעית");
  if (!valTrim("force")) throw new Error("נא למלא את שדה כוח/משימה");
  const isAudit = type === AUDIT_TYPE;
  const isHq = type === HQ_TYPE;
  const isOffensive = type === OFFENSIVE_TYPE;

  if (!isAudit && !isHq && !isOffensive) {
    if (!val("observationsIntegration")) {
      throw new Error("נא למלא את שדה שילוב תצפיות בתרגילים");
    }
  }

  const base = {
    type,
    meta: {
      role: val("role"),
      name: valTrim("name"),
      sector: val("sector"),
      force: valTrim("force"),
      deployment: val("deployment")
    },
    observationsIntegration: (!isAudit && !isHq && !isOffensive) ? val("observationsIntegration") : null,
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


el("saveBtn")?.addEventListener("click", async () => {
  try {
    await ensureAnon();
    const data = collectData();
    data.meta.deviceId = getOrCreateDeviceId();
    data.createdAt = serverTimestamp();
    data.schemaVersion = 7;

    if (statusLine) statusLine.textContent = "⌛ שומר ומייצא...";

    const res = await saveIfNeeded(data);

    // Check if we should offer to save/update the user's profile on this device
    const currentProfile = {
      deployment: data.meta.deployment || "",
      sector: data.meta.sector || "",
      name: data.meta.name || "",
      role: data.meta.role || ""
    };
    const savedProfile = getSavedProfile();
    if (hasProfileChanged(currentProfile, savedProfile)) {
      const promptMsg = savedProfile
        ? "זיהינו שינוי בפרטים האישיים (תעסוקה מבצעית, גזרה, שם מלא או תפקיד).\nהאם לעדכן ולשמור את הפרטים החדשים במכשיר זה לפעמים הבאות?"
        : "האם לשמור את פרטיך (תעסוקה מבצעית, גזרה, שם מלא ותפקיד) במכשיר זה למילוי אוטומטי בפעמים הבאות?";
      if (window.confirm(promptMsg)) {
        saveDeviceProfile(currentProfile);
      }
    }

    const txt = buildWhatsappText(data);
    const waUrl = "https://wa.me/?text=" + encodeURIComponent(txt);

    // Try clipboard
    try { await navigator.clipboard.writeText(txt); } catch (err) { console.warn("[form] Clipboard failed:", err); }

    // Clear form and draft context after success (will re-populate saved device profile if approved)
    localStorage.removeItem(STORAGE_KEY);
    resetForm();

    // Navigation
    if (isMobile()) {
      // On mobile, direct location change is more reliable for app intents
      window.location.href = waUrl;
    } else {
      // On desktop, open in new tab
      window.open(waUrl, "_blank", "noopener");
    }

    if (statusLine) {
      statusLine.textContent = res.isDuplicate
        ? `📲 נשמר בעבר (נמנע כפילות). נפתח וואטסאפ… מזהה: ${res.id}`
        : `📲 נשמר. נפתח וואטסאפ… מזהה: ${res.id}`;
    }
  } catch (e) {
    console.error(e);
    if (e.message === "נא למלא את שדה שילוב תצפיות בתרגילים" || 
        e.message === "נא לבחור תעסוקה מבצעית" || 
        e.message === "נא למלא את שדה כוח/משימה") {
      alert(e.message);
      if (statusLine) statusLine.textContent = "❌ " + e.message;
      return;
    }
    if (statusLine) statusLine.textContent = "❌ שמירה/יצוא לוואטסאפ נכשל";
  }
});


// Persistence hooks
["role", "name", "sector", "force", "deployment"].forEach(id => {
  el(id)?.addEventListener("change", (e) => {
    if (id === "deployment") updateSectors();
    saveContext();
  });
  el(id)?.addEventListener("blur", saveContext);
});

// Initial load
async function initForm() {
  getOrCreateDeviceId();
  try {
    await ensureAnon();
  } catch (e) {
    console.warn("[form] Anonymous auth failed", e);
  }
  loadContext();
  await loadDynamicLists();
  checkForUpdates();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initForm);
} else {
  initForm();
}

