// public/js/reports.js (v2)
import { db } from "./firebase-init.js";
import { loginEmailPassword, logout, watchAuth } from "./auth.js";
import {
  collection, getDocs, query, where, orderBy, limit, startAfter, Timestamp,
  doc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const el = (id)=>document.getElementById(id);

const loginStatus = el("loginStatus");
const listStatus  = el("listStatus");
const tbody       = el("tbody");

const modalBackdrop = el("modalBackdrop");
const modalMeta     = el("modalMeta");
const modalBody     = el("modalBody");
const editModalBtn   = el("editModalBtn");
const deleteModalBtn = el("deleteModalBtn");

let lastDoc = null;
let lastQueryBase = null;
let currentRow = null;
let isEditing = false;
let isAuthed = false;

const pad = (n) => String(n).padStart(2,"0");
function fmtDate(ts){
  try{
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
    if (!d) return "—";
    return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }catch{
    return "—";
  }
}

function toLocalDatetimeInputValue(ts){
  try{
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
    if (!d) return "";
    // datetime-local expects: YYYY-MM-DDTHH:MM
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth()+1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }catch{
    return "";
  }
}

// דירוג “רמזור”
const clamp1to5 = (n) => Math.max(1, Math.min(5, Number(n) || 0));
function icon(n){
  const v = clamp1to5(n);
  if (v >= 5) return "🟢";
  if (v === 4) return "✅";
  if (v === 3) return "🙂";
  if (v === 2) return "⚠️";
  return "🔴";
}

function avg(vals){
  const v = (vals || []).map(Number).filter(x => Number.isFinite(x) && x > 0);
  if (!v.length) return null;
  return v.reduce((s,x)=>s+x,0) / v.length;
}

function to100(avg5){
  if (avg5 == null) return null;
  return Math.round((avg5/5)*100);
}

function computeScores(audit){
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

function getOverallScoreDisplay(doc){
  const d = doc || {};
  if (d.type !== "ביקורת קצה מבצעי" || !d.audit) return "—";
  const s = d.score || computeScores(d.audit);
  return (s?.overall100 ?? "—");
}

function renderModalView(){
  const { id, data } = currentRow;
  const m = data.meta || {};
  const s = (data.type === "ביקורת קצה מבצעי" && data.audit) ? (data.score || computeScores(data.audit)) : null;

  const displayTs = data.eventAt || data.createdAt;
  const createdTs = data.createdAt;
  const dtPart = data.eventAt
    ? `${fmtDate(displayTs)} · הוזן במערכת: ${fmtDate(createdTs)}`
    : `${fmtDate(displayTs)}`;

  modalMeta.textContent = `${dtPart} · ${data.type || "—"} · ${m.sector || "—"} · ${m.name || "—"} (${m.role || "—"})`;

  const parts = [];

  parts.push(`<div class="small"><b>כוח מתרגל:</b> ${escapeHtml(m.force || "—")}</div>`);

  if (data.type !== "ביקורת קצה מבצעי" && data.exerciseDescription) {
    parts.push(`<div style="margin-top:10px"><b>תיאור התרגול</b></div>`);
    parts.push(`<div style="white-space:pre-wrap">${escapeHtml(data.exerciseDescription)}</div>`);
  }

  if (s) {
    parts.push(`<div class="small" style="margin-top:6px"><b>ציון סופי:</b> ${escapeHtml(s.overall100 ?? "—")} &nbsp; | &nbsp; <b>מבצעיות:</b> ${escapeHtml(s.operational100 ?? "—")} &nbsp; <b>תקשוב:</b> ${escapeHtml(s.tech100 ?? "—")} &nbsp; <b>מודיעין:</b> ${escapeHtml(s.intel100 ?? "—")} &nbsp; <b>רפואה:</b> ${escapeHtml(s.medical100 ?? "—")}</div>`);
  }

  if (data.type === "ביקורת קצה מבצעי" && data.audit) {
    const a = data.audit;
    parts.push(`<hr/>`);
    parts.push(`<div><b>ציונים (רמזור)</b></div>`);

    parts.push(`<div style="margin-top:8px"><b>📌 מבצעיות (80%)</b></div>`);
    parts.push(`<ul style="margin:8px 0 0; padding-inline-start:18px">
      <li>מיקום+שפה+גזרה: ${icon(a.posSector)} (${a.posSector ?? "—"})</li>
      <li>תדריך משימה: ${icon(a.missionBriefing)} (${a.missionBriefing ?? "—"})</li>
      <li>היסטוריה גזרתית: ${icon(a.sectorHistory)} (${a.sectorHistory ?? "—"})</li>
      <li>הבנת האיום: ${icon(a.threatUnderstanding)} (${a.threatUnderstanding ?? "—"})</li>
      <li>נראות ודיגום: ${icon(a.appearance)} (${a.appearance ?? "—"})</li>
      <li>עקרון המאמ״ץ: ${icon(a.effort)} (${a.effort ?? "—"})</li>
      <li>תרגולות ומקת״גים: ${icon(a.drills)} (${a.drills ?? "—"})</li>
      <li>הופ״א: ${icon(a.roe)} (${a.roe ?? "—"})</li>
    </ul>`);

    const ft = a.forceTraining || {};
    const trained = ft.trained === "yes" ? "כן" : ft.trained === "no" ? "לא" : "—";
    const tType = ft.trainingType === "methodical" ? "מתודי" : ft.trainingType === "practical" ? "מעשי" : "—";
    parts.push(`<div class="small"><b>תרגול הכוח:</b> ${trained}${ft.trained === "yes" ? ` (${tType})` : ""}</div>`);

    parts.push(`<div style="margin-top:10px"><b>📌 תקשוב (10%)</b></div>`);
    parts.push(`<ul style="margin:8px 0 0; padding-inline-start:18px">
      <li>ליונט/אלפ״א/תיק משימה: ${icon(a.systems)} (${a.systems ?? "—"})</li>
      <li>קשר: ${icon(a.communication)} (${a.communication ?? "—"})</li>
    </ul>`);

    parts.push(`<div style="margin-top:10px"><b>📌 מודיעין (5%)</b></div>`);
    parts.push(`<ul style="margin:8px 0 0; padding-inline-start:18px">
      <li>עזרים בעמדה: ${icon(a.intelTools)} (${a.intelTools ?? "—"})</li>
    </ul>`);

    parts.push(`<div style="margin-top:10px"><b>📌 רפואה (5%)</b></div>`);
    parts.push(`<ul style="margin:8px 0 0; padding-inline-start:18px">
      <li>רפואה: ${icon(a.medical)} (${a.medical ?? "—"})</li>
    </ul>`);
  }

  parts.push(`<hr/>`);
  parts.push(`<div><b>פערים שעלו מהכוח</b></div>`);
  parts.push(`<div style="white-space:pre-wrap">${escapeHtml(data.gaps || "—")}</div>`);

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
}

function renderModalEdit(){
  const { data } = currentRow;
  const m = data.meta || {};

  const keepText = (data.keep || []).join("\n");
  const improveText = (data.improve || []).join("\n");

  const dtValue = toLocalDatetimeInputValue(data.eventAt || data.createdAt);

  modalBody.innerHTML = `
    <div>
      <label>תאריך ושעה</label>
      <input id="e_dt" type="datetime-local" value="${escapeHtml(dtValue)}" />
      <div class="small" style="margin-top:6px;opacity:.85">* משמש לדיווח תאריך/שעה של הביקורת/תרגול. אם לא בטוח, השאר כפי שהוא.</div>
    </div>

    <div class="row">
      <div>
        <label>שם</label>
        <input id="e_name" value="${escapeHtml(m.name || "")}" />
      </div>
      <div>
        <label>תפקיד</label>
        <input id="e_role" value="${escapeHtml(m.role || "")}" />
      </div>
    </div>

    <div class="row">
      <div>
        <label>גזרה</label>
        <input id="e_sector" value="${escapeHtml(m.sector || "")}" />
      </div>
      <div>
        <label>כוח מתרגל</label>
        <input id="e_force" value="${escapeHtml(m.force || "")}" />
      </div>
    </div>

    ${data.type !== "ביקורת קצה מבצעי" ? `
      <label>תיאור התרגול</label>
      <textarea id="e_exDesc" placeholder="תיאור התרגול">${escapeHtml(data.exerciseDescription || "")}</textarea>
    ` : ""}

    <label>פערים שעלו מהכוח</label>
    <textarea id="e_gaps" placeholder="פערים">${escapeHtml(data.gaps || "")}</textarea>

    <label>הערות</label>
    <textarea id="e_notes" placeholder="הערות">${escapeHtml(data.notes || "")}</textarea>

    <div class="row">
      <div>
        <label>נקודות לשימור (שורה לכל נקודה)</label>
        <textarea id="e_keep" placeholder="שורה לכל נקודה">${escapeHtml(keepText)}</textarea>
      </div>
      <div>
        <label>נקודות לשיפור (שורה לכל נקודה)</label>
        <textarea id="e_improve" placeholder="שורה לכל נקודה">${escapeHtml(improveText)}</textarea>
      </div>
    </div>

    <div class="small" style="margin-top:10px;opacity:.85">* עריכת ציונים/רמזור לא נתמכת כאן כרגע (רק שדות טקסט/מטא).</div>
  `;
}

function openModal(row){
  currentRow = row;
  isEditing = false;
  editModalBtn.textContent = "עריכה";
  deleteModalBtn.disabled = !isAuthed;
  editModalBtn.disabled = !isAuthed;
  renderModalView();
  modalBackdrop.classList.remove("hidden");
}

function closeModal(){
  modalBackdrop.classList.add("hidden");
  isEditing = false;
  editModalBtn.textContent = "עריכה";
  deleteModalBtn.disabled = !isAuthed;
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
  isAuthed = !!u;
  loginStatus.textContent = u ? `✅ מחובר: ${u.email || "anonymous"}` : "🔒 לא מחובר";
  if (!isAuthed) {
    editModalBtn.disabled = true;
    deleteModalBtn.disabled = true;
  }
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
editModalBtn.addEventListener("click", async ()=>{
  if (!currentRow) return;
  if (!isAuthed) return;

  if (!isEditing) {
    // enter edit
    isEditing = true;
    editModalBtn.textContent = "שמירה";
    deleteModalBtn.disabled = true;
    renderModalEdit();
    return;
  }

  // save
  try{
    editModalBtn.disabled = true;
    editModalBtn.textContent = "שומר...";

    const get = (id)=>document.getElementById(id);

    // date/time
    const dtRaw = (get("e_dt")?.value || "").trim();
    let eventAt = null;
    if (dtRaw) {
      const d = new Date(dtRaw);
      if (!isNaN(d.getTime())) eventAt = Timestamp.fromDate(d);
    }

    const meta = {
      name: (get("e_name")?.value || "").trim(),
      role: (get("e_role")?.value || "").trim(),
      sector: (get("e_sector")?.value || "").trim(),
      force: (get("e_force")?.value || "").trim(),
    };

    const keep = (get("e_keep")?.value || "")
      .split(/\r?\n/)
      .map(s=>s.trim())
      .filter(Boolean)
      .slice(0, 20);

    const improve = (get("e_improve")?.value || "")
      .split(/\r?\n/)
      .map(s=>s.trim())
      .filter(Boolean)
      .slice(0, 20);

    const payload = {
      meta,
      gaps: (get("e_gaps")?.value || "").trim(),
      notes: (get("e_notes")?.value || "").trim(),
      keep,
      improve,
    };

    if (eventAt) payload.eventAt = eventAt;

    if (currentRow.data.type !== "ביקורת קצה מבצעי") {
      payload.exerciseDescription = (get("e_exDesc")?.value || "").trim();
    }

    await updateDoc(doc(db, "reviews", currentRow.id), payload);

    // update local copy
    currentRow.data = { ...currentRow.data, ...payload, meta: payload.meta };

    isEditing = false;
    editModalBtn.textContent = "עריכה";
    deleteModalBtn.disabled = false;
    renderModalView();
  }catch(e){
    console.error(e);
    alert("שמירה נכשלה (אין הרשאה / תקלה)");
  }finally{
    editModalBtn.disabled = false;
  }
});

deleteModalBtn.addEventListener("click", async ()=>{
  if (!currentRow) return;
  if (!isAuthed) return;
  const ok = confirm("למחוק את הרשומה? פעולה זו אינה הפיכה.");
  if (!ok) return;
  try{
    deleteModalBtn.disabled = true;
    await deleteDoc(doc(db, "reviews", currentRow.id));

    // remove row from table (best-effort)
    [...tbody.querySelectorAll("tr")].forEach(tr=>{
      const btn = tr.querySelector("button[data-open]");
      if (btn?.getAttribute("data-open") === currentRow.id) tr.remove();
    });

    closeModal();
    alert("נמחק בהצלחה");
  }catch(e){
    console.error(e);
    alert("מחיקה נכשלה (אין הרשאה / תקלה)");
  }finally{
    deleteModalBtn.disabled = false;
  }
});
modalBackdrop.addEventListener("click", (e)=>{
  if (e.target === modalBackdrop) closeModal();
});

function buildBaseQuery(){
  const type = el("filterType").value;
  const sector = el("filterSector").value;
  const name = el("filterName").value.trim().toLowerCase();
  const daysBack = Number(el("filterDays").value || 30);

  const since = Timestamp.fromDate(new Date(Date.now() - daysBack * 24*60*60*1000));

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

    const displayTs = d.eventAt || d.createdAt;

    tr.innerHTML = `
      <td>${fmtDate(displayTs)}</td>
      <td>${escapeHtml(d.type || "—")}</td>
      <td>${escapeHtml(m.sector || "—")}</td>
      <td>${escapeHtml(m.name || "—")}</td>
      <td>${escapeHtml(m.role || "—")}</td>
      <td>${escapeHtml(m.force || "—")}</td>
      <td>${escapeHtml(getOverallScoreDisplay(d))}</td>
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

    if (!lastQueryBase) lastQueryBase = { clauses, name };

    const base = lastQueryBase;

    const qParts = [...base.clauses, limit(200)];
    if (lastDoc) qParts.splice(qParts.length - 1, 0, startAfter(lastDoc));

    const qRef = query(collection(db, "reviews"), ...qParts);
    const snap = await getDocs(qRef);

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


async function exportAllReports() {
  try {
    listStatus.textContent = "⏳ מייצא את כל הרשומות...";

    const snap = await getDocs(collection(db, "reviews"));
    const out = [];

    snap.forEach((d) => {
      const v = d.data() || {};
      const createdAt = v.createdAt?.toDate ? v.createdAt.toDate().toISOString() : null;

      out.push({
        id: d.id,
        createdAt,
        schemaVersion: v.schemaVersion ?? null,
        type: v.type ?? null,
        meta: v.meta ?? null,
        audit: v.audit ?? null,
        score: v.score ?? null,
        exerciseDescription: v.exerciseDescription ?? null,
        gaps: v.gaps ?? null,
        keep: v.keep ?? null,
        improve: v.improve ?? null
      });
    });

    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "all_reviews_export.json";
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);

    listStatus.textContent = `✅ יוצאו ${out.length} רשומות לקובץ JSON`;
  } catch (e) {
    console.error(e);
    listStatus.textContent = "❌ יצוא נכשל";
  }
}

el("exportAllBtn")?.addEventListener("click", exportAllReports);

// חשיפה ל-onclick במקרה של שימוש חיצוני
window.exportAllReports = exportAllReports;
