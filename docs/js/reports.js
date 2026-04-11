// public/js/reports.js (v3)
import { db } from "./firebase-init.js";
import { initGlobalAuthUI, watchAuth } from "./auth.js";
import { buildWhatsappText } from "./pdf.js";
import {
  collection, getDocs, query, orderBy, limit, startAfter, Timestamp,
  doc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const el = (id)=>document.getElementById(id);
const listStatus  = el("listStatus");
const tbody       = el("tbody");
const modalBackdrop = el("modalBackdrop");
const modalMeta     = el("modalMeta");
const modalBody     = el("modalBody");
const editModalBtn   = el("editModalBtn");
const deleteModalBtn = el("deleteModalBtn");
const exportModalBtn = el("exportModalBtn");

const AUDIT_TYPE = "ביקורת קצה מבצעי";
const HQ_TYPE = "ביקורת חמ״ל";
const OFFENSIVE_TYPE = "סיכום פעילות התקפית ⚔️";
const DRONE_TYPE = "סיכום פעילות רחפן 🚁";
const pad = (n) => String(n).padStart(2,"0");
const h = (s) => String(s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");

let lastDoc = null;
let currentRows = [];
let currentFilteredRows = [];
let currentRow = null;
let isEditing = false;
let isAuthed = false;

const TYPE_OPTIONS = [AUDIT_TYPE, "תרגול משימה", "תרגיל מסגרתי אורגני", "תרגיל משולב כוחות", OFFENSIVE_TYPE, HQ_TYPE, DRONE_TYPE];
const SECTOR_OPTIONS = ["אלון מורה", "איתמר", "ברכה", "לב השומרון", "אחר"];
const ROLE_OPTIONS = ["צמ״מ", "מג״ד", "סמג״ד", "מ״פ", "מ״מ", "מ״כ/סמ״ל", "קמב״ץ", "קצין אג״ם", "מטיס / נווט", "אחר"];
const HQ_ITEM_LABELS = {
  shabzak: 'שבצ״ק לפעילויות', initiatedPage: 'דף יזומות פלוגתי', settlementMaps: 'מפות ישובים', crownsProcedure: 'פק״ל כתרים',
  optionsProcedure: 'פקל אופציות', orders: 'סדפ״ים', hardCommunication: 'דרכי תקשורת קשיחים', radioAndMasoah: 'תקינות קשר ומשואה', campDefenseFiles: 'תיקי הגנת מחנה'
};

function fmtDate(ts){
  try{
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
    if (!d) return "—";
    return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }catch{ return "—"; }
}
function toLocalDatetimeInputValue(ts){
  try{
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
    if (!d) return "";
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }catch{ return ""; }
}
function clamp1to5(n){ return Math.max(1, Math.min(5, Number(n) || 0)); }
function icon(n){ if (n === 'na' || n == null) return '—'; const v=clamp1to5(n); if (v>=5) return '🟢'; if (v===4) return '✅'; if (v===3) return '🙂'; if (v===2) return '⚠️'; return '🔴'; }
function avg(vals){ const v=(vals||[]).map(Number).filter(x=>Number.isFinite(x)&&x>0); if(!v.length) return null; return v.reduce((s,x)=>s+x,0)/v.length; }
function to100(avg5){ return avg5 == null ? null : Math.round((avg5/5)*100); }
function readDate(data){ return data?.eventAt?.toDate?.() || data?.createdAt?.toDate?.() || null; }
function selectHtml(id, options, selected){ return `<select id="${id}"><option value="">בחר</option>${options.map(v=>`<option value="${h(v)}" ${v===selected?'selected':''}>${h(v)}</option>`).join('')}</select>`; }
function ratingSelectHtml(id, selected){ const opts=['na',1,2,3,4,5]; const labels={na:'לא רלוונטי',1:'🔴',2:'⚠️',3:'🙂',4:'✅',5:'🟢'}; return `<select id="${id}">${opts.map(v=>`<option value="${v}" ${String(v)===String(selected ?? 'na')?'selected':''}>${labels[v]}</option>`).join('')}</select>`; }

function computeAuditScores(audit){
  if (!audit) return null;
  const opAvg = avg([audit.posSector,audit.missionBriefing,audit.sectorHistory,audit.threatUnderstanding,audit.appearance,audit.effort,audit.drills,audit.roe]);
  const techAvg = avg([audit.systems,audit.communication]);
  const intelAvg = avg([audit.intelTools]);
  const medAvg = avg([audit.medical]);
  const weights = { op:0.8, tech:0.1, intel:0.05, med:0.05 };
  const parts = [{key:'op',avg:opAvg},{key:'tech',avg:techAvg},{key:'intel',avg:intelAvg},{key:'med',avg:medAvg}].filter(p=>p.avg!=null);
  const weightedAvg5 = parts.length ? parts.reduce((s,p)=>s+p.avg*weights[p.key],0)/parts.reduce((s,p)=>s+weights[p.key],0) : null;
  return { mode:'audit', overall100:to100(weightedAvg5), operational100:to100(opAvg), tech100:to100(techAvg), intel100:to100(intelAvg), medical100:to100(medAvg) };
}
function computeHqScores(hq){
  if (!hq) return null;
  const routineAvg = avg([hq.logDocumentation,hq.shiftHandoverQuality]);
  const drillAvg = avg([hq.professionalKnowledge,hq.situationalAwareness,hq.commonPictureTransfer,hq.medicalAndCasualties,hq.connectivity,hq.sectorKnowledge,hq.forceActivation,hq.neighborInterface]);
  const weights = { routine:0.25, drill:0.75 };
  const parts = [{key:'routine',avg:routineAvg},{key:'drill',avg:drillAvg}].filter(p=>p.avg!=null);
  const weightedAvg5 = parts.length ? parts.reduce((s,p)=>s+p.avg*weights[p.key],0)/parts.reduce((s,p)=>s+weights[p.key],0) : null;
  return { mode:'hq', overall100:to100(weightedAvg5), routine100:to100(routineAvg), drill100:to100(drillAvg) };
}
function getScore(d){ return d.score || (d.type === HQ_TYPE ? computeHqScores(d.hqAudit) : d.type === AUDIT_TYPE ? computeAuditScores(d.audit) : null); }
function getOverallScoreDisplay(d){ return getScore(d)?.overall100 ?? '—'; }
function normalizeRating(v){ return v === 'na' || v === '' || v == null ? 'na' : Number(v); }
function splitLines(value){ return String(value || '').split(/\r?\n/).map(s=>s.trim()).filter(Boolean).slice(0,20); }
function normalizeOffensiveSummary(data){
  const src = data?.offensiveSummary || {};
  const proc = src.battleProcedure || {};
  const manage = src.battleManagement || {};
  const fallbackKeep = Array.isArray(data?.keep) ? data.keep : [];
  const fallbackImprove = Array.isArray(data?.improve) ? data.improve : [];
  return {
    missionType: src.missionType || '',
    locationType: src.locationType || '',
    battleProcedure: {
      keep: Array.isArray(proc.keep) && proc.keep.length ? proc.keep : fallbackKeep,
      improve: Array.isArray(proc.improve) && proc.improve.length ? proc.improve : fallbackImprove,
    },
    battleManagement: {
      keep: Array.isArray(manage.keep) ? manage.keep : [],
      improve: Array.isArray(manage.improve) ? manage.improve : [],
    },
  };
}
function prepareRecordForExport(row) {
  const { id, data: v } = row;
  const score = getScore(v);
  const offensiveSummary = v.type === OFFENSIVE_TYPE ? normalizeOffensiveSummary(v) : null;
  const isoDate = (ts) => ts?.toDate ? ts.toDate().toISOString() : (ts instanceof Date ? ts.toISOString() : null);

  return {
    id,
    createdAt: isoDate(v.createdAt),
    eventAt: isoDate(v.eventAt),
    type: v.type ?? null,
    meta: v.meta ?? null,
    offensiveSummary,
    audit: v.audit ?? null,
    hqAudit: v.hqAudit ?? null,
    score,
    exerciseDescription: v.exerciseDescription ?? null,
    keep: v.keep ?? null,
    improve: v.improve ?? null,
    notes: v.notes ?? null,
    schemaVersion: v.schemaVersion ?? null
  };
}

function renderModalView(){
  const { id, data } = currentRow;
  const m = data.meta || {};
  const s = getScore(data);
  const dtPart = data.eventAt ? `${fmtDate(data.eventAt)} · הוזן במערכת: ${fmtDate(data.createdAt)}` : `${fmtDate(data.createdAt)}`;
  modalMeta.textContent = `${dtPart} · ${data.type || '—'} · ${m.sector || '—'} · ${m.name || '—'} (${m.role || '—'})`;
  const parts = [];
  parts.push(`<div class="small"><b>כוח:</b> ${h(m.force || '—')}</div>`);

  if (data.type !== AUDIT_TYPE && data.type !== HQ_TYPE && data.exerciseDescription) {
    const descLabel = data.type === DRONE_TYPE ? "תיאור הפעילות" : "תיאור התרגול";
    parts.push(`<div style="margin-top:10px"><b>${descLabel}</b></div><div style="white-space:pre-wrap">${h(data.exerciseDescription)}</div>`);
  }
  if (s) {
    parts.push(`<div class="small" style="margin-top:6px"><b>ציון סופי:</b> ${h(s.overall100 ?? '—')}</div>`);
  }

  if (data.type === AUDIT_TYPE && data.audit) {
    const a = data.audit;
    parts.push(`<hr/><div><b>ציונים (רמזור)</b></div>`);
    const groups = [
      ['📌 מבצעיות (80%)', [['מיקום+שפה+גזרה', a.posSector],['תדריך משימה', a.missionBriefing],['היסטוריה גזרתית', a.sectorHistory],['הבנת האיום', a.threatUnderstanding],['נראות ודיגום', a.appearance],['עקרון המאמ״ץ', a.effort],['תרגולות ומקת״גים', a.drills],['הופ״א', a.roe]]],
      ['📌 תקשוב (10%)', [['ליונט/אלפ״א/תיק משימה', a.systems],['קשר', a.communication]]],
      ['📌 מודיעין (5%)', [['עזרים בעמדה', a.intelTools]]],
      ['📌 רפואה (5%)', [['רפואה', a.medical]]],
    ];
    groups.forEach(([title, rows]) => {
      parts.push(`<div style="margin-top:10px"><b>${title}</b></div><ul style="margin:8px 0 0; padding-inline-start:18px">${rows.filter(([,v])=>v!=='na').map(([label,v])=>`<li>${label}: ${icon(v)} (${h(v ?? '—')})</li>`).join('') || '<li>—</li>'}</ul>`);
    });
    const ft = a.forceTraining || {};
    const trained = ft.trained === 'yes' ? 'כן' : ft.trained === 'no' ? 'לא' : '—';
    const tType = ft.trainingType === 'methodical' ? 'מתודי' : ft.trainingType === 'practical' ? 'מעשי' : '—';
    parts.push(`<div class="small"><b>תרגול הכוח:</b> ${trained}${ft.trained === 'yes' ? ` (${tType})` : ''}</div>`);
  }

  if (data.type === OFFENSIVE_TYPE) {
    const o = normalizeOffensiveSummary(data);
    const proc = o.battleProcedure || {};
    const manage = o.battleManagement || {};
    parts.push(`<hr/><div><b>סיכום פעילות התקפית ⚔️</b></div>`);
    parts.push(`<div class="row"><div><b>סוג משימה</b><div>${h(o.missionType || '—')}</div></div><div><b>מיקום</b><div>${h(o.locationType || '—')}</div></div></div>`);
    parts.push(`<hr/><div><b>נוהל הקרב</b></div>`);
    parts.push(`<div class="row"><div><div><b>נקודות לשימור</b></div><ul style="margin:8px 0 0; padding-inline-start:18px">${(proc.keep||[]).map(x=>`<li>${h(x)}</li>`).join('') || '<li>—</li>'}</ul></div><div><div><b>נקודות לשיפור</b></div><ul style="margin:8px 0 0; padding-inline-start:18px">${(proc.improve||[]).map(x=>`<li>${h(x)}</li>`).join('') || '<li>—</li>'}</ul></div></div>`);
    parts.push(`<hr/><div><b>ניהול הקרב</b></div>`);
    parts.push(`<div class="row"><div><div><b>נקודות לשימור</b></div><ul style="margin:8px 0 0; padding-inline-start:18px">${(manage.keep||[]).map(x=>`<li>${h(x)}</li>`).join('') || '<li>—</li>'}</ul></div><div><div><b>נקודות לשיפור</b></div><ul style="margin:8px 0 0; padding-inline-start:18px">${(manage.improve||[]).map(x=>`<li>${h(x)}</li>`).join('') || '<li>—</li>'}</ul></div></div>`);
  }

  if (data.type === HQ_TYPE && data.hqAudit) {
    const a = data.hqAudit;
    parts.push(`<hr/><div><b>ביקורת חמ״ל</b></div>`);
    parts.push(`<div style="margin-top:10px"><b>🧰 הימצאות רכיבי חמ״ל</b></div><ul style="margin:8px 0 0; padding-inline-start:18px">${Object.entries(HQ_ITEM_LABELS).map(([k,label])=>`<li>${label}: ${a.items?.[k] ? '✅' : '❌'}</li>`).join('')}</ul>`);
    parts.push(`<div style="margin-top:10px"><b>📝 תפקוד שוטף</b></div><ul style="margin:8px 0 0; padding-inline-start:18px"><li>תיעוד ביומן המבצעי: ${icon(a.logDocumentation)} (${h(a.logDocumentation ?? '—')})</li><li>איכות העברת משמרת: ${icon(a.shiftHandoverQuality)} (${h(a.shiftHandoverQuality ?? '—')})</li></ul>`);
    if (a.exerciseOutline) parts.push(`<div style="margin-top:10px"><b>מתווה התרגיל</b></div><div style="white-space:pre-wrap">${h(a.exerciseOutline)}</div>`);
    if (a.exerciseEvaluation) parts.push(`<div style="margin-top:10px"><b>הערכת ביצוע בתרגיל</b></div><div style="white-space:pre-wrap">${h(a.exerciseEvaluation)}</div>`);
    const rows = [['ידע מקצועי', a.professionalKnowledge],['הבנת תמונת מצב', a.situationalAwareness],['איכות העברת תמונת מצב', a.commonPictureTransfer],['טיפול רפואי ופצועים', a.medicalAndCasualties],['חיבור', a.connectivity],['הכרת גזרה', a.sectorKnowledge],['הפעלת כוחות במרחב', a.forceActivation],['ממשק לגזרות שכנות', a.neighborInterface]];
    parts.push(`<div style="margin-top:10px"><b>🎯 ציוני תרגיל חמ״ל</b></div><ul style="margin:8px 0 0; padding-inline-start:18px">${rows.filter(([,v])=>v!=='na').map(([label,v])=>`<li>${label}: ${icon(v)} (${h(v ?? '—')})</li>`).join('') || '<li>—</li>'}</ul>`);
  }

  if (data.type !== OFFENSIVE_TYPE) {
    parts.push(`<hr/><div class="row"><div><div><b>נקודות לשימור</b></div><ul style="margin:8px 0 0; padding-inline-start:18px">${(data.keep||[]).map(x=>`<li>${h(x)}</li>`).join('') || '<li>—</li>'}</ul></div><div><div><b>נקודות לשיפור</b></div><ul style="margin:8px 0 0; padding-inline-start:18px">${(data.improve||[]).map(x=>`<li>${h(x)}</li>`).join('') || '<li>—</li>'}</ul></div></div>`);
  }
  parts.push(`<hr/><div><b>הערות נוספות</b></div><div style="white-space:pre-wrap">${h(data.notes || '—')}</div>`);
  parts.push(`<div class="small" style="opacity:.8;margin-top:10px">DocId: ${h(id)}</div>`);
  modalBody.innerHTML = parts.join('');
}

function renderAuditEdit(a){
  return `
    <hr/><div><b>ציוני ביקורת קצה מבצעי</b></div>
    <div class="row"><div><label>מיקום+שפה+גזרה</label>${ratingSelectHtml('e_r1', a.posSector)}</div><div><label>תדריך משימה</label>${ratingSelectHtml('e_r2', a.missionBriefing)}</div></div>
    <div class="row"><div><label>היסטוריה גזרתית</label>${ratingSelectHtml('e_r3', a.sectorHistory)}</div><div><label>הבנת האיום</label>${ratingSelectHtml('e_r4', a.threatUnderstanding)}</div></div>
    <div class="row"><div><label>נראות ודיגום</label>${ratingSelectHtml('e_r5', a.appearance)}</div><div><label>עקרון המאמ״ץ</label>${ratingSelectHtml('e_r6', a.effort)}</div></div>
    <div class="row"><div><label>תרגולות ומקת״גים</label>${ratingSelectHtml('e_r7', a.drills)}</div><div><label>הופ״א</label>${ratingSelectHtml('e_r8', a.roe)}</div></div>
    <div class="row"><div><label>ליונט/תיק משימה/אלפ״א</label>${ratingSelectHtml('e_r9', a.systems)}</div><div><label>קשר</label>${ratingSelectHtml('e_r10', a.communication)}</div></div>
    <div class="row"><div><label>עזרים בעמדה</label>${ratingSelectHtml('e_r11', a.intelTools)}</div><div><label>רפואה</label>${ratingSelectHtml('e_r12', a.medical)}</div></div>
    <div class="row"><div><label>תרגול הכוח</label><select id="e_forceTrained"><option value="">בחר</option><option value="yes" ${a.forceTraining?.trained==='yes'?'selected':''}>כן</option><option value="no" ${a.forceTraining?.trained==='no'?'selected':''}>לא</option></select></div><div><label>סוג תרגול</label><select id="e_forceTrainingType"><option value="">בחר</option><option value="methodical" ${a.forceTraining?.trainingType==='methodical'?'selected':''}>מתודי</option><option value="practical" ${a.forceTraining?.trainingType==='practical'?'selected':''}>מעשי</option></select></div></div>`;
}

function renderOffensiveEdit(src){
  const o = normalizeOffensiveSummary({ offensiveSummary: src });
  return `
    <hr/><div><b>סיכום פעילות התקפית ⚔️</b></div>
    <div class="row">
      <div><label>סוג משימה</label>${selectHtml('e_offMissionType', ['מעצר','מארב ירי','סריקת אמל״ח','מיפוי','ביקור בית','הצבעת אמל״ח','פטרול / צ׳ק פוסט'], o.missionType || '')}</div>
      <div><label>מיקום</label>${selectHtml('e_offLocationType', ['עיר','כפר','מ.פ','אחר'], o.locationType || '')}</div>
    </div>
    <hr/><div><b>נוהל הקרב</b></div>
    <div class="row">
      <div><label>נקודות לשימור (שורה לכל נקודה)</label><textarea id="e_offProcKeep">${h((o.battleProcedure?.keep || []).join('\n'))}</textarea></div>
      <div><label>נקודות לשיפור (שורה לכל נקודה)</label><textarea id="e_offProcImprove">${h((o.battleProcedure?.improve || []).join('\n'))}</textarea></div>
    </div>
    <hr/><div><b>ניהול הקרב</b></div>
    <div class="row">
      <div><label>נקודות לשימור (שורה לכל נקודה)</label><textarea id="e_offManageKeep">${h((o.battleManagement?.keep || []).join('\n'))}</textarea></div>
      <div><label>נקודות לשיפור (שורה לכל נקודה)</label><textarea id="e_offManageImprove">${h((o.battleManagement?.improve || []).join('\n'))}</textarea></div>
    </div>`;
}

function renderHqEdit(a){
  return `
    <hr/><div><b>ביקורת חמ״ל</b></div>
    <div class="checkGrid">${Object.entries(HQ_ITEM_LABELS).map(([k,label])=>`<label class="checkItem"><input type="checkbox" id="e_hq_item_${k}" ${a.items?.[k] ? 'checked' : ''}> ${label}</label>`).join('')}</div>
    <div class="row"><div><label>תיעוד ביומן המבצעי</label>${ratingSelectHtml('e_hq_r1', a.logDocumentation)}</div><div><label>איכות העברת משמרת</label>${ratingSelectHtml('e_hq_r2', a.shiftHandoverQuality)}</div></div>
    <label>מתווה התרגיל</label><textarea id="e_hq_outline">${h(a.exerciseOutline || '')}</textarea>
    <label>הערכת ביצוע בתרגיל</label><textarea id="e_hq_eval">${h(a.exerciseEvaluation || '')}</textarea>
    <div class="row"><div><label>ידע מקצועי</label>${ratingSelectHtml('e_hq_r3', a.professionalKnowledge)}</div><div><label>הבנת תמונת מצב</label>${ratingSelectHtml('e_hq_r4', a.situationalAwareness)}</div></div>
    <div class="row"><div><label>איכות העברת תמונת מצב</label>${ratingSelectHtml('e_hq_r5', a.commonPictureTransfer)}</div><div><label>טיפול רפואי ופצועים</label>${ratingSelectHtml('e_hq_r6', a.medicalAndCasualties)}</div></div>
    <div class="row"><div><label>חיבור</label>${ratingSelectHtml('e_hq_r7', a.connectivity)}</div><div><label>הכרת גזרה</label>${ratingSelectHtml('e_hq_r8', a.sectorKnowledge)}</div></div>
    <div class="row"><div><label>הפעלת כוחות במרחב</label>${ratingSelectHtml('e_hq_r9', a.forceActivation)}</div><div><label>ממשק לגזרות שכנות</label>${ratingSelectHtml('e_hq_r10', a.neighborInterface)}</div></div>`;
}

function renderModalEdit(){
  const { data } = currentRow;
  const m = data.meta || {};
  modalBody.innerHTML = `
    <div>
      <label>תאריך ושעה</label>
      <input id="e_dt" type="datetime-local" value="${h(toLocalDatetimeInputValue(data.eventAt || data.createdAt))}" />
    </div>
    <div class="row">
      <div><label>סוג</label>${selectHtml('e_type', TYPE_OPTIONS, data.type || '')}</div>
      <div><label>גזרה</label>${selectHtml('e_sector', SECTOR_OPTIONS, m.sector || '')}</div>
    </div>
    <div class="row">
      <div><label>שם</label><input id="e_name" value="${h(m.name || '')}" /></div>
      <div><label>תפקיד</label>${selectHtml('e_role', ROLE_OPTIONS, m.role || '')}</div>
    </div>
    <label>כוח</label><input id="e_force" value="${h(m.force || '')}" />
    ${data.type !== AUDIT_TYPE && data.type !== HQ_TYPE && data.type !== OFFENSIVE_TYPE ? `<label>${data.type === DRONE_TYPE ? 'תיאור הפעילות' : 'תיאור התרגול'}</label><textarea id="e_exDesc">${h(data.exerciseDescription || '')}</textarea>` : ''}
    ${data.type === AUDIT_TYPE ? renderAuditEdit(data.audit || {}) : ''}
    ${data.type === OFFENSIVE_TYPE ? renderOffensiveEdit(data.offensiveSummary || {}) : ''}
    ${data.type === HQ_TYPE ? renderHqEdit(data.hqAudit || { items:{} }) : ''}
    ${data.type !== OFFENSIVE_TYPE ? `<div class="row">
      <div><label>נקודות לשימור (שורה לכל נקודה)</label><textarea id="e_keep">${h((data.keep || []).join('\n'))}</textarea></div>
      <div><label>נקודות לשיפור (שורה לכל נקודה)</label><textarea id="e_improve">${h((data.improve || []).join('\n'))}</textarea></div>
    </div>` : ''}
    <label>הערות נוספות</label><textarea id="e_notes">${h(data.notes || '')}</textarea>`;
}

function openModal(row){ currentRow = row; isEditing = false; editModalBtn.textContent = 'עריכה'; deleteModalBtn.disabled = !isAuthed; editModalBtn.disabled = !isAuthed; renderModalView(); modalBackdrop.classList.remove('hidden'); }
function closeModal(){ modalBackdrop.classList.add('hidden'); isEditing = false; editModalBtn.textContent = 'עריכה'; deleteModalBtn.disabled = !isAuthed; }
initGlobalAuthUI(false);

watchAuth((u)=>{ 
  isAuthed = !!u;
  if (!isAuthed) { 
    if(editModalBtn) editModalBtn.disabled = true; 
    if(deleteModalBtn) deleteModalBtn.disabled = true; 
    tbody.innerHTML=''; currentRows=[]; currentFilteredRows=[]; listStatus.textContent=''; el('moreBtn').classList.add('hidden'); lastDoc=null;
  }
});
el('closeModalBtn').addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (e)=>{ if (e.target === modalBackdrop) closeModal(); });

function applyClientFilters(rows){
  const type = el('filterType').value;
  const sector = el('filterSector').value;
  const name = el('filterName').value.trim().toLowerCase();
  return rows.filter(({data}) => {
    const d = data || {};
    if (type && d.type !== type) return false;
    if (sector && (d.meta?.sector || '') !== sector) return false;
    if (name && !(d.meta?.name || '').toLowerCase().includes(name)) return false;
    return true;
  });
}

function appendRows(rows){
  for (const row of rows) {
    const d = row.data; const m = d.meta || {}; const tr = document.createElement('tr');
    tr.innerHTML = `<td>${fmtDate(d.eventAt || d.createdAt)}</td><td>${h(d.type || '—')}</td><td>${h(m.sector || '—')}</td><td>${h(m.name || '—')}</td><td>${h(m.role || '—')}</td><td>${h(m.force || '—')}</td><td>${h(getOverallScoreDisplay(d))}</td><td><button data-open="${h(row.id)}">פתח</button></td>`;
    tr.querySelector('button[data-open]').addEventListener('click', ()=>openModal(row));
    tbody.appendChild(tr);
  }
}

async function loadPage({ reset }){
  try{
    listStatus.textContent = 'טוען...';
    el('moreBtn').classList.add('hidden');
    if (reset) { tbody.innerHTML = ''; lastDoc = null; currentRows = []; currentFilteredRows = []; }

    const daysBack = Number(el('filterDays').value || 30);
    const since = Timestamp.fromDate(new Date(Date.now() - daysBack * 24*60*60*1000));
    const qParts = [collection(db, 'reviews'), orderBy('createdAt', 'desc'), limit(200)];
    if (lastDoc) qParts.splice(qParts.length - 1, 0, startAfter(lastDoc));
    const snap = await getDocs(query(...qParts));
    const fetched = snap.docs.map(d => ({ id:d.id, data:d.data() })).filter(({data}) => {
      const created = data?.createdAt?.toDate?.();
      return created ? created >= since.toDate() : true;
    });
    currentRows.push(...fetched);
    currentFilteredRows = applyClientFilters(currentRows);
    tbody.innerHTML = '';
    appendRows(currentFilteredRows);
    lastDoc = snap.docs[snap.docs.length - 1] || lastDoc;
    listStatus.textContent = `✅ נטענו ${currentFilteredRows.length} רשומות`;
    if (snap.docs.length === 200) el('moreBtn').classList.remove('hidden');
  }catch(e){ console.error(e); listStatus.textContent = '❌ אין הרשאה (ודא שאתה admin) / תקלה'; }
}

editModalBtn.addEventListener('click', async ()=>{
  if (!currentRow || !isAuthed) return;
  if (!isEditing) { isEditing = true; editModalBtn.textContent = 'שמירה'; deleteModalBtn.disabled = true; renderModalEdit(); return; }
  try {
    editModalBtn.disabled = true; editModalBtn.textContent = 'שומר...';
    const get = (id)=>document.getElementById(id);
    const dtRaw = (get('e_dt')?.value || '').trim();
    let eventAt = null;
    if (dtRaw) { const d = new Date(dtRaw); if (!isNaN(d.getTime())) eventAt = Timestamp.fromDate(d); }
    const type = get('e_type')?.value || currentRow.data.type;
    const payload = {
      type,
      meta: { name: (get('e_name')?.value || '').trim(), role: get('e_role')?.value || '', sector: get('e_sector')?.value || '', force: (get('e_force')?.value || '').trim() },
      notes: (get('e_notes')?.value || '').trim(),
      keep: type === OFFENSIVE_TYPE ? [] : splitLines(get('e_keep')?.value),
      improve: type === OFFENSIVE_TYPE ? [] : splitLines(get('e_improve')?.value),
      exerciseDescription: null,
      offensiveSummary: null,
      audit: null,
      hqAudit: null,
      score: null,
    };
    if (eventAt) payload.eventAt = eventAt;

    if (type !== AUDIT_TYPE && type !== HQ_TYPE && type !== OFFENSIVE_TYPE) payload.exerciseDescription = (get('e_exDesc')?.value || '').trim();
    if (type === OFFENSIVE_TYPE) {
      payload.offensiveSummary = {
        missionType: get('e_offMissionType')?.value || '',
        locationType: get('e_offLocationType')?.value || '',
        battleProcedure: {
          keep: splitLines(get('e_offProcKeep')?.value),
          improve: splitLines(get('e_offProcImprove')?.value),
        },
        battleManagement: {
          keep: splitLines(get('e_offManageKeep')?.value),
          improve: splitLines(get('e_offManageImprove')?.value),
        }
      };
    }
    if (type === AUDIT_TYPE) {
      const audit = {
        posSector: normalizeRating(get('e_r1')?.value), missionBriefing: normalizeRating(get('e_r2')?.value), sectorHistory: normalizeRating(get('e_r3')?.value), threatUnderstanding: normalizeRating(get('e_r4')?.value),
        appearance: normalizeRating(get('e_r5')?.value), effort: normalizeRating(get('e_r6')?.value), drills: normalizeRating(get('e_r7')?.value), roe: normalizeRating(get('e_r8')?.value),
        systems: normalizeRating(get('e_r9')?.value), communication: normalizeRating(get('e_r10')?.value), intelTools: normalizeRating(get('e_r11')?.value), medical: normalizeRating(get('e_r12')?.value),
        forceTraining: { trained: get('e_forceTrained')?.value || '', trainingType: get('e_forceTrainingType')?.value || '' }
      };
      payload.audit = audit;
      payload.score = computeAuditScores(audit);
    }
    if (type === HQ_TYPE) {
      const hqAudit = {
        items: Object.fromEntries(Object.keys(HQ_ITEM_LABELS).map(k => [k, !!get(`e_hq_item_${k}`)?.checked])),
        logDocumentation: normalizeRating(get('e_hq_r1')?.value), shiftHandoverQuality: normalizeRating(get('e_hq_r2')?.value),
        exerciseOutline: (get('e_hq_outline')?.value || '').trim(), exerciseEvaluation: (get('e_hq_eval')?.value || '').trim(),
        professionalKnowledge: normalizeRating(get('e_hq_r3')?.value), situationalAwareness: normalizeRating(get('e_hq_r4')?.value), commonPictureTransfer: normalizeRating(get('e_hq_r5')?.value),
        medicalAndCasualties: normalizeRating(get('e_hq_r6')?.value), connectivity: normalizeRating(get('e_hq_r7')?.value), sectorKnowledge: normalizeRating(get('e_hq_r8')?.value), forceActivation: normalizeRating(get('e_hq_r9')?.value), neighborInterface: normalizeRating(get('e_hq_r10')?.value)
      };
      payload.hqAudit = hqAudit;
      payload.score = computeHqScores(hqAudit);
    }

    await updateDoc(doc(db, 'reviews', currentRow.id), payload);
    currentRow.data = { ...currentRow.data, ...payload, meta: payload.meta };
    currentRows = currentRows.map(r => r.id === currentRow.id ? currentRow : r);
    currentFilteredRows = applyClientFilters(currentRows);
    tbody.innerHTML=''; appendRows(currentFilteredRows);
    isEditing = false; editModalBtn.textContent = 'עריכה'; deleteModalBtn.disabled = false; renderModalView();
  } catch(e) { console.error(e); alert('שמירה נכשלה (אין הרשאה / תקלה)'); }
  finally { editModalBtn.disabled = false; }
});

deleteModalBtn.addEventListener('click', async ()=>{
  if (!currentRow || !isAuthed) return;
  if (!confirm('למחוק את הרשומה? פעולה זו אינה הפיכה.')) return;
  try {
    deleteModalBtn.disabled = true;
    await deleteDoc(doc(db, 'reviews', currentRow.id));
    currentRows = currentRows.filter(r => r.id !== currentRow.id);
    currentFilteredRows = currentFilteredRows.filter(r => r.id !== currentRow.id);
    tbody.innerHTML=''; appendRows(currentFilteredRows); closeModal(); alert('נמחק בהצלחה');
  } catch(e) { console.error(e); alert('מחיקה נכשלה (אין הרשאה / תקלה)'); }
  finally { deleteModalBtn.disabled = false; }
});

exportModalBtn.addEventListener('click', async ()=>{
  if (!currentRow) return;
  try {
    const txt = buildWhatsappText(currentRow.data);
    await navigator.clipboard.writeText(txt);
    window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank', 'noopener');
  } catch (e) {
    console.error(e);
    alert('יצוא הסיכום נכשל');
  }
});

async function exportAllReports() {
  try {
    if (!currentFilteredRows || currentFilteredRows.length === 0) {
      alert('אין רשומות לייצוא (נסה לטעון נתונים קודם)');
      return;
    }
    listStatus.textContent = `⏳ מייצא ${currentFilteredRows.length} רשומות מסוננות...`;
    
    // Use the helper to map only the currently filtered rows
    const out = currentFilteredRows.map(prepareRecordForExport);
    
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `records_export_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    
    listStatus.textContent = `✅ יוצאו ${out.length} רשומות לקובץ JSON`;
  } catch (e) {
    console.error(e);
    listStatus.textContent = '❌ יצוא נכשל';
  }
}

el('loadBtn').addEventListener('click', ()=>loadPage({ reset:true }));
el('moreBtn').addEventListener('click', ()=>loadPage({ reset:false }));
el('exportAllBtn')?.addEventListener('click', exportAllReports);
window.exportAllReports = exportAllReports;
