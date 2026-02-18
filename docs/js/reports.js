// public/js/reports.js
import { db } from "./firebase-init.js";
import { loginEmailPassword, logout, watchAuth } from "./auth.js";
import {
  collection, getDocs, query, where, orderBy, limit, startAfter, Timestamp
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const el = (id)=>document.getElementById(id);

const loginStatus = el("loginStatus");
const listStatus = el("listStatus");
const tbody = el("tbody");

const modalBackdrop = el("modalBackdrop");
const modalMeta = el("modalMeta");
const modalBody = el("modalBody");

let lastDoc = null;
let lastQueryBase = null;

function fmtDate(ts){
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const pad = (n)=>String(n).padStart(2,"0");
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function avgAudit(audit){
  if (!audit) return "—";
  const keys = ["appearance","discipline","knowledge","readiness","cleanliness","missionDeliveryQuality","missionMastery"];
  const vals = keys.map(k => Number(audit[k])).filter(v => Number.isFinite(v) && v > 0);
  if (!vals.length) return "—";
  const avg = vals.reduce((s,v)=>s+v,0) / vals.length;
  return avg.toFixed(1);
}

function stars(n){
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "—";
  return "⭐".repeat(Math.min(5, Math.max(1, v)));
}

function openModal(row){
  const { id, data } = row;
  const m = data.meta || {};
  modalMeta.textContent = `${fmtDate(data.createdAt)} · ${data.type || "—"} · ${m.sector || "—"} · ${m.name || "—"} (${m.role || "—"})`;

  const parts = [];

  parts.push(`<div class="small"><b>כוח מתרגל:</b> ${escapeHtml(m.force || "—")}</div>`);

  if (data.type === "ביקורת קצה מבצעי" && data.audit) {
    const a = data.audit;
    parts.push(`<hr/>`);
    parts.push(`<div><b>ציונים</b></div>`);
    parts.push(`<ul style="margin:8px 0 0; padding-inline-start:18px">
      <li>נראות הכוח: ${stars(a.appearance)} (${a.appearance ?? "—"})</li>
      <li>שמירה על מאמ״ץ: ${stars(a.discipline)} (${a.discipline ?? "—"})</li>
      <li>הכרת הגזרה והיסטוריה: ${stars(a.knowledge)} (${a.knowledge ?? "—"})</li>
      <li>תקינות ומוכנות: ${stars(a.readiness)} (${a.readiness ?? "—"})</li>
      <li>ניקיון העמדה: ${stars(a.cleanliness)} (${a.cleanliness ?? "—"})</li>
      <li>איכות שילוח המשימה: ${stars(a.missionDeliveryQuality)} (${a.missionDeliveryQuality ?? "—"})</li>
      <li>בקיאות במשימה: ${stars(a.missionMastery)} (${a.missionMastery ?? "—"})</li>
    </ul>`);

    const ft = a.forceTraining || {};
    const trained = ft.trained === "yes" ? "כן" : ft.trained === "no" ? "לא" : "—";
    const tType = ft.trainingType === "methodical" ? "מתודי" : ft.trainingType === "practical" ? "מעשי" : "—";
    parts.push(`<div class="small"><b>תרגול הכוח:</b> ${trained}${ft.trained === "yes" ? ` (${tType})` : ""}</div>`);
  }

  parts.push(`<hr/>`);
  parts.push(`<div><b>הערות</b></div>`);
  parts.push(`<div style="white-space:pre-wrap">${escapeHtml(data.notes || "—")}</div>`);

  parts.push(`<hr/>`);
  parts.push(`<div class="row">
    <div>
      <div><b>נקודות לשימור</b></div>
      <ul style="margin:8px 0 0; padding-inline-start:18px">${(data.keep||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("") || "<li>—</li>"}</ul>
    </div>
    <div>
      <div><b>נקודות לשיפור</b></div>
      <ul style="margin:8px 0 0; padding-inline-start:18px">${(data.improve||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("") || "<li>—</li>"}</ul>
    </div>
  </div>`);

  parts.push(`<div class="small" style="opacity:.8;margin-top:10px">DocId: ${escapeHtml(id)}</div>`);

  modalBody.innerHTML = parts.join("");
  modalBackdrop.classList.remove("hidden");
}

function closeModal(){
  modalBackdrop.classList.add("hidden");
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// auth UI
function toggleLoginUI(isAuthed){
  ["loginBtn","loginBtnInline"].forEach(id => el(id)?.classList.toggle("hidden", isAuthed));
  ["logoutBtn","logoutBtnInline"].forEach(id => el(id)?.classList.toggle("hidden", !isAuthed));
}

watchAuth((u)=>{
  toggleLoginUI(!!u);
  loginStatus.textContent = u ? `✅ מחובר: ${u.email || "anonymous"}` : "🔒 לא מחובר";
});

async function doLogin(){
  try{
    loginStatus.textContent = "מתחבר...";
    const email = el("adminEmail").value.trim();
    const pass = el("adminPass").value;
    await loginEmailPassword(email, pass);
    loginStatus.textContent = "✅ התחברת. אפשר לטעון רשומות.";
  } catch(e){
    console.error(e);
    loginStatus.textContent = "❌ התחברות נכשלה";
  }
}

async function doLogout(){
  await logout();
  loginStatus.textContent = "התנתקת";
  tbody.innerHTML = "";
  listStatus.textContent = "";
  el("moreBtn").classList.add("hidden");
  lastDoc = null;
  lastQueryBase = null;
}

["loginBtn","loginBtnInline"].forEach(id => el(id)?.addEventListener("click", doLogin));
["logoutBtn","logoutBtnInline"].forEach(id => el(id)?.addEventListener("click", doLogout));

el("closeModalBtn").addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e)=>{
  if (e.target === modalBackdrop) closeModal();
});

function buildBaseQuery(){
  const type = el("filterType").value;
  const sector = el("filterSector").value;
  const name = el("filterName").value.trim().toLowerCase();
  const daysBack = Number(el("filterDays").value || 30);

  const since = Timestamp.fromDate(new Date(Date.now() - daysBack * 24*60*60*1000));

  // בסיס: טווח ימים + סדר לפי תאריך יורד
  // הערה: חיפוש בשם נעשה בצד לקוח (כי startsWith דורש אינדקסים/שדה מנורמל).
  const clauses = [
    where("createdAt", ">=", since),
    orderBy("createdAt", "desc")
  ];

  if (type) clauses.push(where("type", "==", type));
  if (sector) clauses.push(where("meta.sector", "==", sector));

  return { clauses, name };
}

function appendRows(docs){
  const rows = docs.map(d => ({ id: d.id, data: d.data() }));
  for (const row of rows) {
    const d = row.data;
    const m = d.meta || {};
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${fmtDate(d.createdAt)}</td>
      <td>${escapeHtml(d.type || "—")}</td>
      <td>${escapeHtml(m.sector || "—")}</td>
      <td>${escapeHtml(m.name || "—")}</td>
      <td>${escapeHtml(m.role || "—")}</td>
      <td>${escapeHtml(m.force || "—")}</td>
      <td>${d.type === "ביקורת קצה מבצעי" ? avgAudit(d.audit) : "—"}</td>
      <td><button data-open="${escapeHtml(row.id)}">פתח</button></td>
    `;

    tr.querySelector("button[data-open]").addEventListener("click", ()=>openModal(row));
    tbody.appendChild(tr);
  }
}

async function loadPage({ reset }){
  try{
    listStatus.textContent = "טוען...";
    el("moreBtn").classList.add("hidden");

    if (reset) {
      tbody.innerHTML = "";
      lastDoc = null;
      lastQueryBase = null;
    }

    const { clauses, name } = buildBaseQuery();

    // שמור "בסיס" לפאג'ינציה
    if (!lastQueryBase) lastQueryBase = { clauses, name };

    const base = lastQueryBase;

    const qParts = [...base.clauses, limit(200)];
    if (lastDoc) qParts.splice(qParts.length - 1, 0, startAfter(lastDoc));

    const qRef = query(collection(db, "reviews"), ...qParts);
    const snap = await getDocs(qRef);

    // חיפוש שם בצד לקוח
    let docs = snap.docs;
    if (base.name) {
      docs = docs.filter(doc => {
        const nm = (doc.data()?.meta?.name || "").toLowerCase();
        return nm.includes(base.name);
      });
    }

    appendRows(docs);

    lastDoc = snap.docs[snap.docs.length - 1] || lastDoc;

    listStatus.textContent = `✅ נטענו ${docs.length} רשומות`;
    if (snap.docs.length === 200) el("moreBtn").classList.remove("hidden");
  } catch(e){
    console.error(e);
    listStatus.textContent = "❌ אין הרשאה (ודא שאתה admin) / תקלה";
  }
}

el("loadBtn").addEventListener("click", ()=>loadPage({ reset:true }));
el("moreBtn").addEventListener("click", ()=>loadPage({ reset:false }));
