// public/js/pdf.js (v4) - Cleaned version (WhatsApp only)
const pad = (n) => String(n).padStart(2, "0");
function formatHeDate(d = new Date()) { return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }

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
  if (m.deployment) lines.push(`תעסוקה מבצעית: ${m.deployment}`);

  if (d.type !== AUDIT_TYPE && d.type !== HQ_TYPE && d.type !== OFFENSIVE_TYPE) {
    if (d.observationsIntegration) {
      lines.push("", `🔍 *שילוב תצפיות בתרגילים:* ${d.observationsIntegration}`);
    }
    if (d.exerciseDescription) {
      const descLabel = d.type === DRONE_TYPE ? "תיאור הפעילות" : "תיאור התרגול";
      lines.push("", `📝 *${descLabel}:*`, d.exerciseDescription);
    }
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
