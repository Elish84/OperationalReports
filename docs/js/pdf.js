// public/js/pdf.js

const STAR = "⭐";
function stars(n){
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "—";
  return STAR.repeat(Math.max(1, Math.min(5, v)));
}

function avgAudit(audit){
  if (!audit) return null;
  const keys = [
    "appearance",
    "discipline",
    "knowledge",
    "readiness",
    "cleanliness",
    "missionDeliveryQuality",
    "missionMastery"
  ];
  const vals = keys.map(k => Number(audit[k])).filter(v => Number.isFinite(v) && v > 0);
  if (!vals.length) return null;
  const avg = vals.reduce((s,v)=>s+v,0) / vals.length;
  return Math.round(avg * 10) / 10; // 1 ספרה אחרי הנקודה
}

function fmtDate(ts){
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const pad = (n)=>String(n).padStart(2,"0");
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function buildWhatsappText(data){
  const m = data.meta || {};
  const lines = [];

  lines.push(`📋 *סיכום ${data.type || "דוח"}*`);
  lines.push(`🕒 ${fmtDate(data.createdAt)}`); // אם createdAt עדיין serverTimestamp בזמן יצירה, בוואטסאפ זה יכול להיות "—" לפני שמירה
  lines.push(`📍 גזרה: ${m.sector || "—"}`);
  lines.push(`👤 מבצע: ${m.name || "—"} (${m.role || "—"})`);
  lines.push(`🧩 כוח: ${m.force || "—"}`);

  if (data.type === "ביקורת קצה מבצעי" && data.audit) {
    const a = data.audit;
    const avg = avgAudit(a);

    lines.push(``);
    lines.push(`⭐ *ציונים*${avg != null ? ` | ממוצע: *${avg}/5*` : ""}`);
    lines.push(`1) נראות הכוח: ${stars(a.appearance)} (${a.appearance ?? "—"})`);
    lines.push(`2) שמירה על מאמ״ץ: ${stars(a.discipline)} (${a.discipline ?? "—"})`);
    lines.push(`3) הכרת הגזרה והיסטוריה: ${stars(a.knowledge)} (${a.knowledge ?? "—"})`);
    lines.push(`4) תקינות ומוכנות: ${stars(a.readiness)} (${a.readiness ?? "—"})`);
    lines.push(`5) ניקיון העמדה: ${stars(a.cleanliness)} (${a.cleanliness ?? "—"})`);
    lines.push(`6) איכות שילוח המשימה: ${stars(a.missionDeliveryQuality)} (${a.missionDeliveryQuality ?? "—"})`);
    lines.push(`7) בקיאות במשימה: ${stars(a.missionMastery)} (${a.missionMastery ?? "—"})`);

    const ft = a.forceTraining || {};
    const trained = ft.trained === "yes" ? "כן" : ft.trained === "no" ? "לא" : "—";
    const tType =
      ft.trainingType === "methodical" ? "מתודי" :
      ft.trainingType === "practical" ? "מעשי" : "—";
    lines.push(`🎯 תרגול הכוח: ${trained}${ft.trained === "yes" ? ` (${tType})` : ""}`);
  }

  if (data.notes) {
    lines.push(``);
    lines.push(`📝 הערות:`);
    lines.push(data.notes);
  }

  if ((data.keep || []).length) {
    lines.push(``);
    lines.push(`✅ נק׳ לשימור:`);
    (data.keep || []).slice(0,3).forEach((x,i)=>lines.push(`${i+1}. ${x}`));
  }

  if ((data.improve || []).length) {
    lines.push(``);
    lines.push(`🛠️ נק׳ לשיפור:`);
    (data.improve || []).slice(0,3).forEach((x,i)=>lines.push(`${i+1}. ${x}`));
  }

  return lines.join("\n");
}
