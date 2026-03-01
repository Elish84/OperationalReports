// public/js/form.js (v2)
import { db } from "./firebase-init.js";
import { ensureAnon } from "./auth.js";
import { collection, addDoc, serverTimestamp, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { buildWhatsappText, exportPdf } from "./pdf.js";

const el = (id) => document.getElementById(id);
const statusLine = el("statusLine");async function sha256Hex(str) {
  const buf = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,"0")).join("");
}

function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

async function saveIfNeeded(baseData) {
  // חשוב: לא כוללים createdAt בתוך ה-hash כדי למנוע כפילויות שווא
  const dataForHash = { ...baseData };
  delete dataForHash.createdAt;

  const hash = await sha256Hex(stableStringify(dataForHash));

  const q = query(collection(db, "reviews"), where("hash", "==", hash));
  const snap = await getDocs(q);
  if (!snap.empty) {
    return { id: snap.docs[0].id, isDuplicate: true };
  }

  const docRef = await addDoc(collection(db, "reviews"), {
    ...baseData,
    hash
  });

  return { id: docRef.id, isDuplicate: false };
}

function numOrNull(v) {
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
    audit.roe,
  ]);

  const techAvg = avg([audit.systems, audit.communication]);
  const intelAvg = avg([audit.intelTools]);
  const medAvg = avg([audit.medical]);

  const weightedAvg5 =
    (opAvg ?? 0) * 0.8 +
    (techAvg ?? 0) * 0.1 +
    (intelAvg ?? 0) * 0.05 +
    (medAvg ?? 0) * 0.05;

  return {
    overallAvg5: Math.round(weightedAvg5 * 10) / 10,
    overall100: to100(weightedAvg5),
    operational100: to100(opAvg),
    tech100: to100(techAvg),
    intel100: to100(intelAvg),
    medical100: to100(medAvg),
  };
}

function collectData() {
  const type = el("type").value;
  const isAudit = type === "ביקורת קצה מבצעי";

  const base = {
    type,
    meta: {
      role: el("role").value,
      name: el("name").value.trim(),
      sector: el("sector").value,
      force: el("force").value.trim(),
    },
    // רלוונטי לתרגולים/תרגילים בלבד
    exerciseDescription: (el("exerciseDescription")?.value || "").trim(),
    gaps: (el("gaps")?.value || "").trim(),
    notes: el("notes").value.trim(),
    keep: [el("keep1").value, el("keep2").value, el("keep3").value].filter(Boolean),
    improve: [el("imp1").value, el("imp2").value, el("imp3").value].filter(Boolean),
  };

  if (!isAudit) {
    base.audit = null;
    base.score = null;
    return base;
  }

  // בביקורת אין שימוש בתיאור תרגול
  base.exerciseDescription = "";

  // תרגול הכוח
  const trained = el("forceTrained")?.value || "";
  const trainingType = el("forceTrainingType")?.value || "";

  base.audit = {
    // 📌 מבצעיות (80%)
    posSector: numOrNull(el("r1").value),            // 1) מיקום+שפה+גזרה
    missionBriefing: numOrNull(el("r2").value),      // 2) תדריך משימה
    sectorHistory: numOrNull(el("r3").value),        // 3) היסטוריה גזרתית
    threatUnderstanding: numOrNull(el("r4").value),  // 4) הבנת האיום
    appearance: numOrNull(el("r5").value),           // 5) נראות ודיגום
    effort: numOrNull(el("r6").value),               // 6) עקרון המאמ״ץ
    drills: numOrNull(el("r7").value),               // 7) תרגולות ומקת״גים
    roe: numOrNull(el("r8").value),                  // 8) הופ״א

    // 📌 תקשוב (10%)
    systems: numOrNull(el("r9").value),              // 9) ליונט/אלפ״א/תיק משימה
    communication: numOrNull(el("r10").value),       // 10) קשר

    // 📌 מודיעין (5%)
    intelTools: numOrNull(el("r11").value),          // 11) עזרים

    // 📌 רפואה (5%)
    medical: numOrNull(el("r12").value),             // 12) רפואה

    forceTraining: {
      trained, // "yes" | "no" | ""
      trainingType: trained === "yes" ? trainingType : "", // "methodical" | "practical" | ""
    },
  };

  base.score = computeScores(base.audit);
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

el("saveBtn").addEventListener("click", async () => {
  try {
    await ensureAnon();
    const data = collectData();

    data.createdAt = serverTimestamp();
    // v4: הוספת exerciseDescription לתרגולים/תרגילים
    data.schemaVersion = 4;

    const res = await saveIfNeeded(data);

    statusLine.textContent = res.isDuplicate
      ? `⚠️ כבר נשמר בעבר (נמנע כפילות). מזהה: ${res.id}`
      : `✅ נשמר בהצלחה. מזהה: ${res.id}`;
  } catch (e) {
    console.error(e);
    statusLine.textContent = "❌ שמירה נכשלה (בדוק הרשאות / Rules)";
  }
});

el("waBtn").addEventListener("click", async () => {
  try {
    await ensureAnon();
    const data = collectData();

    data.createdAt = serverTimestamp();
    data.schemaVersion = 4;

    const res = await saveIfNeeded(data);

    const baseTxt = buildWhatsappText(data);
    const txt = baseTxt + `

🆔 מזהה רשומה: ${res.id}`;

    await navigator.clipboard.writeText(txt);

    statusLine.textContent = res.isDuplicate
      ? `📋 הועתק לוואטסאפ + כבר נשמר בעבר (נמנע כפילות). מזהה: ${res.id}`
      : `📋 הועתק לוואטסאפ + נשמר אוטומטית. מזהה: ${res.id}`;
  } catch (e) {
    console.error(e);
    statusLine.textContent = "❌ יצוא ווצאפ נכשל";
  }
});

el("pdfBtn").addEventListener("click", async () => {
  const data = collectData();
  const files = el("photos").files || [];
  const photos = await readPhotosAsDataUrls(files);
  await exportPdf(data, photos);
});
