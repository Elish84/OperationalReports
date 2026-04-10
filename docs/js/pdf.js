// public/js/pdf.js (v3)
import "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
const { jsPDF } = window.jspdf;

const AUDIT_TYPE = "ביקורת קצה מבצעי";
const HQ_TYPE = "ביקורת חמ״ל";
const OFFENSIVE_TYPE = "סיכום פעילות התקפית ⚔️";
const DRONE_TYPE = "סיכום פעילות רחפן 🚁";
const clamp1to5 = (n) => Math.max(1, Math.min(5, Number(n) || 0));
const scoreToIcon = (n) => {
  if (n === "na" || n == null) return "—";
  const v = clamp1to5(n);
  if (v >= 5) return "🟢";
  if (v === 4) return "✅";
  if (v === 3) return "🙂";
  if (v === 2) return "⚠️";
  return "🔴";
};

function avg(vals) {
  const v = (vals || []).map(Number).filter((x) => Number.isFinite(x) && x > 0);
  if (!v.length) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}
function to100(avg5) { return avg5 == null ? null : Math.round((avg5 / 5) * 100); }

function computeAuditScores(audit) {
  if (!audit) return null;
  const opAvg = avg([audit.posSector, audit.missionBriefing, audit.sectorHistory, audit.threatUnderstanding, audit.appearance, audit.effort, audit.drills, audit.roe]);
  const techAvg = avg([audit.systems, audit.communication]);
  const intelAvg = avg([audit.intelTools]);
  const medAvg = avg([audit.medical]);
  const weights = { op: 0.8, tech: 0.1, intel: 0.05, med: 0.05 };
  const parts = [{ key: "op", avg: opAvg }, { key: "tech", avg: techAvg }, { key: "intel", avg: intelAvg }, { key: "med", avg: medAvg }].filter((p) => p.avg != null);
  const weightedAvg5 = parts.length ? parts.reduce((s, p) => s + p.avg * weights[p.key], 0) / parts.reduce((s, p) => s + weights[p.key], 0) : null;
  return { mode: "audit", overall100: to100(weightedAvg5), operational100: to100(opAvg), tech100: to100(techAvg), intel100: to100(intelAvg), medical100: to100(medAvg) };
}

function computeHqScores(h) {
  if (!h) return null;
  const routineAvg = avg([h.logDocumentation, h.shiftHandoverQuality]);
  const drillAvg = avg([h.professionalKnowledge, h.situationalAwareness, h.commonPictureTransfer, h.medicalAndCasualties, h.connectivity, h.sectorKnowledge, h.forceActivation, h.neighborInterface]);
  const weights = { routine: 0.25, drill: 0.75 };
  const parts = [{ key: "routine", avg: routineAvg }, { key: "drill", avg: drillAvg }].filter((p) => p.avg != null);
  const weightedAvg5 = parts.length ? parts.reduce((s, p) => s + p.avg * weights[p.key], 0) / parts.reduce((s, p) => s + weights[p.key], 0) : null;
  return { mode: "hq", overall100: to100(weightedAvg5), routine100: to100(routineAvg), drill100: to100(drillAvg) };
}

const pad = (n) => String(n).padStart(2, "0");
function formatHeDate(d = new Date()) { return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function normalizeOffensiveSummary(data) {
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

export function buildWhatsappText(d) {
  const m = d.meta || {};
  const lines = [];
  const pushMetric = (prefix, v) => { if (v === "na") return; lines.push(`${prefix} ${scoreToIcon(v)} (${v ?? "—"})`); };

  const scores = d.score || (d.type === HQ_TYPE ? computeHqScores(d.hqAudit) : computeAuditScores(d.audit));
  lines.push(`🚨*ביקורת/תרגיל/פעילות*🚨`);
  lines.push(`תאריך ושעה: ${formatHeDate(new Date())}`);
  lines.push(`סוג: ${d.type || "—"}`);
  lines.push(`מבצע: ${m.name || "—"} (${m.role || "—"})`);
  lines.push(`גזרה: ${m.sector || "—"}`);
  if (m.force) lines.push(`כוח: ${m.force}`);

  if (d.type !== AUDIT_TYPE && d.type !== HQ_TYPE && d.exerciseDescription) {
    const descLabel = d.type === DRONE_TYPE ? "תיאור הפעילות" : "תיאור התרגול";
    lines.push("", `📝 *${descLabel}:*`, d.exerciseDescription);
  }

  if (d.type === AUDIT_TYPE && d.audit) {
    const a = d.audit;
    lines.push("", `*ציון סופי:* ${scores?.overall100 ?? "—"}`);
    lines.push("", `📌*מבצעיות (80%)*`);
    pushMetric("1. מיקום+שפה+גזרה:", a.posSector);
    pushMetric("2. תדריך משימה:", a.missionBriefing);
    pushMetric("3. היסטוריה גזרתית:", a.sectorHistory);
    pushMetric("4. הבנת האיום:", a.threatUnderstanding);
    pushMetric("5. נראות ודיגום:", a.appearance);
    pushMetric("6. עקרון המאמ״ץ:", a.effort);
    pushMetric("7. תרגולות ומקת״גים:", a.drills);
    pushMetric("8. הופ״א:", a.roe);
    const ft = a.forceTraining || {};
    const trained = ft.trained === "yes" ? "כן" : ft.trained === "no" ? "לא" : "—";
    const tType = ft.trainingType === "methodical" ? "מתודי" : ft.trainingType === "practical" ? "מעשי" : "—";
    lines.push(`תרגול הכוח: ${trained}${ft.trained === "yes" ? ` (${tType})` : ""}`);
    lines.push("", `📌*תקשוב (10%)*`);
    pushMetric("9. ליונט/תיק משימה/אלפ״א:", a.systems);
    pushMetric("10. קשר:", a.communication);
    lines.push("", `📌*מודיעין (5%)*`);
    pushMetric("11. עזרים בעמדה:", a.intelTools);
    lines.push("", `📌*רפואה (5%)*`);
    pushMetric("12. רפואה:", a.medical);
  }

  if (d.type === OFFENSIVE_TYPE) {
    const o = normalizeOffensiveSummary(d);
    const proc = o.battleProcedure || {};
    const manage = o.battleManagement || {};
    lines.push("", "⚔️ *סיכום פעילות התקפית*");
    lines.push(`סוג משימה: ${o.missionType || "—"}`);
    lines.push(`מיקום: ${o.locationType || "—"}`);

    if (proc.keep?.length || proc.improve?.length) {
      lines.push("", "📝 *נוהל הקרב*");
      if (proc.keep?.length) {
        lines.push("💡 *נק׳ לשימור:*");
        proc.keep.slice(0,3).forEach((x) => lines.push(`• ${x}`));
      }
      if (proc.improve?.length) {
        lines.push("🛠️ *נק׳ לשיפור:*");
        proc.improve.slice(0,3).forEach((x) => lines.push(`• ${x}`));
      }
    }

    if (manage.keep?.length || manage.improve?.length) {
      lines.push("", "🎯 *ניהול הקרב*");
      if (manage.keep?.length) {
        lines.push("💡 *נק׳ לשימור:*");
        manage.keep.slice(0,3).forEach((x) => lines.push(`• ${x}`));
      }
      if (manage.improve?.length) {
        lines.push("🛠️ *נק׳ לשיפור:*");
        manage.improve.slice(0,3).forEach((x) => lines.push(`• ${x}`));
      }
    }
  }

  if (d.type === HQ_TYPE && d.hqAudit) {
    const h = d.hqAudit;
    const itemLabels = {
      shabzak: 'שבצ״ק לפעילויות', initiatedPage: 'דף יזומות פלוגתי', settlementMaps: 'מפות ישובים', crownsProcedure: 'פק״ל כתרים',
      optionsProcedure: 'פקל אופציות', orders: 'סדפ״ים', hardCommunication: 'דרכי תקשורת קשיחים', radioAndMasoah: 'תקינות קשר ומשואה', campDefenseFiles: 'תיקי הגנת מחנה'
    };
    lines.push("", `*ציון סופי:* ${scores?.overall100 ?? "—"}`);
    lines.push("", "🧰 *הימצאות רכיבי חמ״ל:*" );
    Object.entries(itemLabels).forEach(([k, label]) => lines.push(`• ${label}: ${h.items?.[k] ? "✅" : "❌"}`));
    lines.push("", "📝 *תפקוד שוטף:*" );
    pushMetric("תיעוד ביומן המבצעי:", h.logDocumentation);
    pushMetric("איכות העברת משמרת:", h.shiftHandoverQuality);
    if (h.exerciseOutline) lines.push("", "📍 *מתווה התרגיל:*", h.exerciseOutline);
    if (h.exerciseEvaluation) lines.push("", "📋 *הערכת ביצוע בתרגיל:*", h.exerciseEvaluation);
    lines.push("", "🎯 *ציוני תרגיל חמ״ל:*" );
    pushMetric("ידע מקצועי:", h.professionalKnowledge);
    pushMetric("הבנת תמונת מצב:", h.situationalAwareness);
    pushMetric("איכות העברת תמונת מצב:", h.commonPictureTransfer);
    pushMetric("טיפול רפואי ופצועים:", h.medicalAndCasualties);
    pushMetric("חיבור:", h.connectivity);
    pushMetric("הכרת גזרה:", h.sectorKnowledge);
    pushMetric("הפעלת כוחות במרחב:", h.forceActivation);
    pushMetric("ממשק לגזרות שכנות:", h.neighborInterface);
  }

  if (d.type !== OFFENSIVE_TYPE && d.keep?.length) { lines.push("", "💡 *נק׳ לשימור:*"); d.keep.slice(0,3).forEach((x) => lines.push(`• ${x}`)); }
  if (d.type !== OFFENSIVE_TYPE && d.improve?.length) { lines.push("", "🛠️ *נק׳ לשיפור:*"); d.improve.slice(0,3).forEach((x) => lines.push(`• ${x}`)); }
  if (d.notes) lines.push("", "🗒️ *הערות נוספות:*", d.notes);
  return lines.join("\n");
}

const FONT_REG_URL = "assets/fonts/NotoSansHebrew-Regular.ttf";
const FONT_BOLD_URL = "assets/fonts/NotoSansHebrew-Bold.ttf";
let _fontReady = false;
async function fetchAsBase64(url) {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Failed to fetch font: ${url} (${res.status})`);
  const buf = await res.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}
function hasHebrew(text) { return /[\u0590-\u05FF]/.test(String(text || "")); }
function rtlFix(text) {
  const s = String(text ?? "");
  if (!hasHebrew(s)) return s;
  return s.split(/(\s+)/).map((p) => (!p || /^\s+$/.test(p) || !hasHebrew(p)) ? p : p.split("").reverse().join("")).join("");
}
async function ensureHebrewFonts(doc) {
  if (_fontReady) return;
  const regB64 = await fetchAsBase64(FONT_REG_URL);
  doc.addFileToVFS("NotoSansHebrew-Regular.ttf", regB64);
  doc.addFont("NotoSansHebrew-Regular.ttf", "NotoSansHebrew", "normal");
  try {
    const boldB64 = await fetchAsBase64(FONT_BOLD_URL);
    doc.addFileToVFS("NotoSansHebrew-Bold.ttf", boldB64);
    doc.addFont("NotoSansHebrew-Bold.ttf", "NotoSansHebrew", "bold");
  } catch {}
  _fontReady = true;
}
function setHebrewFont(doc, style = "normal", size = 12) { doc.setFont("NotoSansHebrew", style); doc.setFontSize(size); }
function rightText(doc, text, xRight, y, opts = {}) { doc.text(rtlFix(text), xRight, y, { align: "right", ...opts }); }
function splitRightLines(doc, text, maxW) { return doc.splitTextToSize(String(text ?? ""), maxW).map(rtlFix); }
function detectImageFormat(dataUrl) { return typeof dataUrl === "string" && dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG"; }

export async function exportPdf(d, photos) {
  const doc = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
  await ensureHebrewFonts(doc);
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const xRight = pageW - margin;
  const maxW = pageW - margin * 2;
  const m = d.meta || {};
  const scores = d.score || (d.type === HQ_TYPE ? computeHqScores(d.hqAudit) : computeAuditScores(d.audit));
  let y = 52;

  const newPageIfNeeded = (needed = 20) => {
    if (y + needed > pageH - 40) { doc.addPage(); y = 52; }
  };
  const addTitle = (txt) => { newPageIfNeeded(20); setHebrewFont(doc, "bold", 13); rightText(doc, txt, xRight, y); y += 16; };
  const addParagraph = (txt) => {
    if (!txt) return;
    setHebrewFont(doc, "normal", 11);
    const lines = splitRightLines(doc, txt, maxW);
    for (const ln of lines) { newPageIfNeeded(16); rightText(doc, ln, xRight, y); y += 14; }
    y += 6;
  };
  const addLine = (txt) => { newPageIfNeeded(16); setHebrewFont(doc, "normal", 11); rightText(doc, txt, xRight, y); y += 14; };

  setHebrewFont(doc, "bold", 18); rightText(doc, "ביקורת / תרגיל – סיכום", xRight, y); y += 24;
  setHebrewFont(doc, "normal", 11);
  addLine(`נוצר: ${formatHeDate(new Date())}`);
  addLine(`סוג: ${d.type || "—"}`);
  addLine(`מבצע: ${m.name || "—"} | תפקיד: ${m.role || "—"}`);
  addLine(`גזרה: ${m.sector || "—"} | כוח: ${m.force || "—"}`);

  if (d.type !== AUDIT_TYPE && d.type !== HQ_TYPE && d.exerciseDescription) {
    const descLabel = d.type === DRONE_TYPE ? "תיאור הפעילות" : "תיאור התרגול";
    addTitle(descLabel);
    addParagraph(d.exerciseDescription);
  }

  if (d.type === AUDIT_TYPE && d.audit) {
    addTitle(`ציון סופי: ${scores?.overall100 ?? "—"} | מבצעיות: ${scores?.operational100 ?? "—"} | תקשוב: ${scores?.tech100 ?? "—"} | מודיעין: ${scores?.intel100 ?? "—"} | רפואה: ${scores?.medical100 ?? "—"}`);
    const a = d.audit;
    [
      ["📌 מבצעיות (80%)", [["1. מיקום העמדה + שפה משותפת + הכרת הגזרה", a.posSector],["2. תדריך משימה", a.missionBriefing],["3. היסטוריה גזרתית", a.sectorHistory],["4. הבנת האיום", a.threatUnderstanding],["5. נראות ודיגום", a.appearance],["6. עקרון המאמ״ץ", a.effort],["7. תרגולות ומקת״גים", a.drills],["8. הופ״א", a.roe]]],
      ["📌 תקשוב (10%)", [["9. ליונט/תיק משימה/אלפ״א", a.systems],["10. קשר", a.communication]]],
      ["📌 מודיעין (5%)", [["11. עזרים בעמדה", a.intelTools]]],
      ["📌 רפואה (5%)", [["12. רפואה", a.medical]]],
    ].forEach(([title, rows], idx) => {
      addTitle(title);
      rows.forEach(([label, v]) => { if (v !== "na") addLine(`${label}: ${scoreToIcon(v)} (${v ?? "—"})`); });
      if (idx === 0) {
        const ft = a.forceTraining || {};
        const trained = ft.trained === "yes" ? "כן" : ft.trained === "no" ? "לא" : "—";
        const tType = ft.trainingType === "methodical" ? "מתודי" : ft.trainingType === "practical" ? "מעשי" : "—";
        addLine(`תרגול הכוח: ${trained}${ft.trained === "yes" ? ` (${tType})` : ""}`);
      }
    });
  }

  if (d.type === OFFENSIVE_TYPE) {
    const o = normalizeOffensiveSummary(d);
    const proc = o.battleProcedure || {};
    const manage = o.battleManagement || {};
    addTitle("סיכום פעילות התקפית");
    addLine(`סוג משימה: ${o.missionType || "—"}`);
    addLine(`מיקום: ${o.locationType || "—"}`);
    if (proc.keep?.length || proc.improve?.length) {
      addTitle("נוהל הקרב");
      if (proc.keep?.length) { addLine("נקודות לשימור:"); proc.keep.slice(0,3).forEach((t) => addLine(`• ${t}`)); }
      if (proc.improve?.length) { addLine("נקודות לשיפור:"); proc.improve.slice(0,3).forEach((t) => addLine(`• ${t}`)); }
    }
    if (manage.keep?.length || manage.improve?.length) {
      addTitle("ניהול הקרב");
      if (manage.keep?.length) { addLine("נקודות לשימור:"); manage.keep.slice(0,3).forEach((t) => addLine(`• ${t}`)); }
      if (manage.improve?.length) { addLine("נקודות לשיפור:"); manage.improve.slice(0,3).forEach((t) => addLine(`• ${t}`)); }
    }
  }

  if (d.type === HQ_TYPE && d.hqAudit) {
    const h = d.hqAudit;
    addTitle(`ציון סופי: ${scores?.overall100 ?? "—"} | תפקוד שוטף: ${scores?.routine100 ?? "—"} | תרגיל חמ״ל: ${scores?.drill100 ?? "—"}`);
    addTitle("הימצאות רכיבי חמ״ל");
    const itemLabels = {
      shabzak: 'שבצ״ק לפעילויות', initiatedPage: 'דף יזומות פלוגתי', settlementMaps: 'מפות ישובים', crownsProcedure: 'פק״ל כתרים',
      optionsProcedure: 'פקל אופציות', orders: 'סדפ״ים', hardCommunication: 'דרכי תקשורת קשיחים', radioAndMasoah: 'תקינות קשר ומשואה', campDefenseFiles: 'תיקי הגנת מחנה'
    };
    Object.entries(itemLabels).forEach(([k, label]) => addLine(`${label}: ${h.items?.[k] ? 'כן' : 'לא'}`));
    addTitle("תפקוד שוטף");
    if (h.logDocumentation !== 'na') addLine(`תיעוד ביומן המבצעי: ${scoreToIcon(h.logDocumentation)} (${h.logDocumentation ?? '—'})`);
    if (h.shiftHandoverQuality !== 'na') addLine(`איכות העברת משמרת: ${scoreToIcon(h.shiftHandoverQuality)} (${h.shiftHandoverQuality ?? '—'})`);
    if (h.exerciseOutline) { addTitle("מתווה התרגיל"); addParagraph(h.exerciseOutline); }
    if (h.exerciseEvaluation) { addTitle("הערכת ביצוע בתרגיל"); addParagraph(h.exerciseEvaluation); }
    addTitle("ציוני תרגיל חמ״ל");
    [["ידע מקצועי", h.professionalKnowledge],["הבנת תמונת מצב", h.situationalAwareness],["איכות העברת תמונת מצב", h.commonPictureTransfer],["טיפול רפואי ופצועים", h.medicalAndCasualties],["חיבור", h.connectivity],["הכרת גזרה", h.sectorKnowledge],["הפעלת כוחות במרחב", h.forceActivation],["ממשק לגזרות שכנות", h.neighborInterface]].forEach(([label, v]) => {
      if (v !== 'na') addLine(`${label}: ${scoreToIcon(v)} (${v ?? '—'})`);
    });
  }

  if (d.type !== OFFENSIVE_TYPE && d.keep?.length) { addTitle("נקודות לשימור"); d.keep.slice(0,3).forEach((t) => addLine(`• ${t}`)); }
  if (d.type !== OFFENSIVE_TYPE && d.improve?.length) { addTitle("נקודות לשיפור"); d.improve.slice(0,3).forEach((t) => addLine(`• ${t}`)); }
  if (d.notes) { addTitle("הערות נוספות"); addParagraph(d.notes); }

  if (photos?.length) {
    for (const ph of photos) {
      doc.addPage();
      y = 52;
      addTitle(`תמונה: ${ph.name || ''}`);
      const fmt = detectImageFormat(ph.dataUrl);
      const imgW = maxW;
      const imgH = Math.min(520, pageH - 120);
      doc.addImage(ph.dataUrl, fmt, margin, y, imgW, imgH, undefined, 'FAST');
    }
  }

  doc.save(`review-${Date.now()}.pdf`);
}
