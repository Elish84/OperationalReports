// public/js/form.js
import { db } from "./firebase-init.js";
import { ensureAnon } from "./auth.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { buildWhatsappText } from "./pdf.js";
import { exportPdf } from "./pdf.js";

const el = (id) => document.getElementById(id);
const statusLine = el("statusLine");

function collectData(){
  const type = el("type").value;
  const isAudit = type === "ביקורת קצה מבצעי";

  return {
    type,
    meta: {
      role: el("role").value,
      name: el("name").value.trim(),
      sector: el("sector").value,
      force: el("force").value.trim(),
    },
    audit: isAudit ? {
      appearance: Number(el("r1").value),
      discipline: Number(el("r2").value),
      knowledge: Number(el("r3").value),
      readiness: Number(el("r4").value),
      cleanliness: Number(el("r5").value),
    } : null,
    notes: el("notes").value.trim(),
    keep: [el("keep1").value, el("keep2").value, el("keep3").value].filter(Boolean),
    improve: [el("imp1").value, el("imp2").value, el("imp3").value].filter(Boolean),
  };
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

el("saveBtn").addEventListener("click", async ()=>{
  try{
    statusLine.textContent = "שומר...";
    await ensureAnon();
    const data = collectData();
    data.createdAt = serverTimestamp();
    // לשימוש עתידי (חקירה/טרייס) – לא לחשוף פרטים מבצעיים מיותרים בדשבורד
    data.schemaVersion = 1;

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
