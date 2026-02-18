// public/js/form.js
import { db } from "./firebase-init.js";
import { ensureAnon } from "./auth.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { buildWhatsappText, exportPdf } from "./pdf.js";

const el = (id) => document.getElementById(id);
const statusLine = el("statusLine");

function numOrNull(v){
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function collectData(){
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
    notes: el("notes").value.trim(),
    keep: [el("keep1").value, el("keep2").value, el("keep3").value].filter(Boolean),
    improve: [el("imp1").value, el("imp2").value, el("imp3").value].filter(Boolean),
  };

  if (!isAudit) {
    base.audit = null;
    return base;
  }

  // ביקורת קצה: דירוגים 1–5 + תרגול הכוח
  const trained = el("forceTrained")?.value || "";
  const trainingType = el("forceTrainingType")?.value || "";

  base.audit = {
    appearance: numOrNull(el("r1").value),          // 1. נראות הכוח
    discipline: numOrNull(el("r2").value),          // 2. שמירה על מאמ״ץ
    knowledge: numOrNull(el("r3").value),           // 3. הכרת הגזרה והיסטוריה
    readiness: numOrNull(el("r4").value),           // 4. תקינות ומוכנות
    cleanliness: numOrNull(el("r5").value),         // 5. ניקיון העמדה
    missionDeliveryQuality: numOrNull(el("r6").value), // 6. איכות שילוח המשימה
    missionMastery: numOrNull(el("r7").value),         // 7. בקיאות במשימה
    forceTraining: {
      trained,                                     // "yes" | "no" | ""
      trainingType: trained === "yes" ? trainingType : "", // "methodical" | "practical" | ""
    }
  };

  return base;
}

async function readPhotosAsDataUrls(files){
  const arr = [];
  for (const f of files) {
    const dataUrl = await new Promise((res, rej)=>{
      const r = new FileReader();
      r.onload = ()=>res(r.result);
      r.onerror = rej;
      r.readAsDataURL(f);
    });
    arr.push({ name: f.name, dataUrl });
  }
  return arr;
}

// UI: להציג "סוג תרגול" רק אם forceTrained === "yes"
function syncTrainingUI(){
  const trainedEl = el("forceTrained");
  const wrap = el("forceTrainingTypeWrap");
  const typeEl = el("forceTrainingType");
  if (!trainedEl || !wrap || !typeEl) return;

  const show = trainedEl.value === "yes";
  wrap.classList.toggle("hidden", !show);
  if (!show) typeEl.value = "";
}

if (el("forceTrained")) {
  el("forceTrained").addEventListener("change", syncTrainingUI);
  // init
  syncTrainingUI();
}

el("saveBtn").addEventListener("click", async ()=>{
  try{
    statusLine.textContent = "שומר...";
    await ensureAnon();
    const data = collectData();

    data.createdAt = serverTimestamp();
    data.schemaVersion = 2;

    await addDoc(collection(db, "reviews"), data);
    statusLine.textContent = "✅ נשמר בהצלחה";
  }catch(e){
    console.error(e);
    statusLine.textContent = "❌ שמירה נכשלה (בדוק הרשאות / Rules)";
  }
});

el("waBtn").addEventListener("click", async ()=>{
  const data = collectData();
  const txt = buildWhatsappText(data);
  await navigator.clipboard.writeText(txt);
  statusLine.textContent = "📋 התקציר הועתק (הדבק בוואטסאפ)";
});

el("pdfBtn").addEventListener("click", async ()=>{
  const data = collectData();
  const files = el("photos").files || [];
  const photos = await readPhotosAsDataUrls(files);
  await exportPdf(data, photos);
});
