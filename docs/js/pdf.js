// public/js/pdf.js
import "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

const { jsPDF } = window.jspdf;

// ---------- WhatsApp helpers ----------
const clamp1to5 = (n) => Math.max(1, Math.min(5, Number(n) || 0));
const scoreToStars = (n) => "⭐".repeat(clamp1to5(n));

function avgAudit(audit) {
  if (!audit) return null;
  const keys = [
    "appearance",
    "discipline",
    "knowledge",
    "readiness",
    "cleanliness",
    "missionDeliveryQuality",
    "missionMastery",
  ];
  const vals = keys
    .map((k) => Number(audit[k]))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (!vals.length) return null;
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  return Math.round(avg * 10) / 10; // 1 decimal
}

function formatHeDate(d = new Date()) {
  // פורמט ידידותי בעברית
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function buildWhatsappText(d) {
  const lines = [];
  const m = d.meta || {};

  lines.push(`📋 ${d.type || "דוח"}`);
  lines.push(`🕒 ${formatHeDate(new Date())}`); // תמיד יש תאריך בתקציר (גם לפני שמירה)
  lines.push(`👤 ${m.name || "—"} (${m.role || "—"})`);
  lines.push(`📍 ${m.sector || "—"}`);
  if (m.force) lines.push(`🧩 כוח: ${m.force}`);

  if (d.type === "ביקורת קצה מבצעי" && d.audit) {
    const avg = avgAudit(d.audit);
    lines.push("");
    lines.push(`🧪 דירוגים:${avg != null ? ` (ממוצע: ${avg}/5)` : ""}`);
    lines.push(`1) נראות: ${scoreToStars(d.audit.appearance)} (${d.audit.appearance ?? "—"})`);
    lines.push(`2) מאמ״ץ: ${scoreToStars(d.audit.discipline)} (${d.audit.discipline ?? "—"})`);
    lines.push(`3) גזרה: ${scoreToStars(d.audit.knowledge)} (${d.audit.knowledge ?? "—"})`);
    lines.push(`4) תקינות: ${scoreToStars(d.audit.readiness)} (${d.audit.readiness ?? "—"})`);
    lines.push(`5) ניקיון: ${scoreToStars(d.audit.cleanliness)} (${d.audit.cleanliness ?? "—"})`);
    lines.push(`6) איכות שילוח: ${scoreToStars(d.audit.missionDeliveryQuality)} (${d.audit.missionDeliveryQuality ?? "—"})`);
    lines.push(`7) בקיאות במשימה: ${scoreToStars(d.audit.missionMastery)} (${d.audit.missionMastery ?? "—"})`);

    const ft = d.audit.forceTraining || {};
    const trained = ft.trained === "yes" ? "כן" : ft.trained === "no" ? "לא" : "—";
    const tType =
      ft.trainingType === "methodical" ? "מתודי" :
      ft.trainingType === "practical" ? "מעשי" : "—";
    lines.push(`🎯 תרגול הכוח: ${trained}${ft.trained === "yes" ? ` (${tType})` : ""}`);
  }

  if (d.keep?.length) {
    lines.push("");
    lines.push("✅ נק׳ לשימור:");
    d.keep.slice(0, 3).forEach((x, i) => lines.push(`${i + 1}. ${x}`));
  }

  if (d.improve?.length) {
    lines.push("");
    lines.push("🛠 נק׳ לשיפור:");
    d.improve.slice(0, 3).forEach((x, i) => lines.push(`${i + 1}. ${x}`));
  }

  if (d.notes) {
    lines.push("");
    lines.push(`📝 הערות: ${d.notes}`);
  }

  return lines.join("\n");
}

// ---------- PDF Hebrew font + RTL helpers ----------

// נתיבי פונטים (שים אותם ב: docs/assets/fonts/)
const FONT_REG_URL = "assets/fonts/NotoSansHebrew-Regular.ttf";
const FONT_BOLD_URL = "assets/fonts/NotoSansHebrew-Bold.ttf";

// cache כדי לא לטעון פונט כל פעם מחדש
let _fontReady = false;

async function fetchAsBase64(url) {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(`Failed to fetch font: ${url} (${res.status})`);
  }
  const buf = await res.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function hasHebrew(text) {
  return /[\u0590-\u05FF]/.test(String(text || ""));
}

// jsPDF לא מבצע bidi; פתרון פרקטי: היפוך שורה כשיש עברית.
// לא מושלם לטקסט מעורב אנגלית/מספרים, אבל עובד מצוין לעברית “נקייה”.
function rtlFix(text) {
  const s = String(text ?? "");
  if (!hasHebrew(s)) return s;
  return s.split("").reverse().join("");
}

async function ensureHebrewFonts(doc) {
  if (_fontReady) return;

  // Regular
  const regB64 = await fetchAsBase64(FONT_REG_URL);
  doc.addFileToVFS("NotoSansHebrew-Regular.ttf", regB64);
  doc.addFont("NotoSansHebrew-Regular.ttf", "NotoSansHebrew", "normal");

  // Bold (אופציונלי: אם לא קיים, ניפול חזרה ל-normal)
  try {
    const boldB64 = await fetchAsBase64(FONT_BOLD_URL);
    doc.addFileToVFS("NotoSansHebrew-Bold.ttf", boldB64);
    doc.addFont("NotoSansHebrew-Bold.ttf", "NotoSansHebrew", "bold");
  } catch {
    // אם אין Bold — נמשיך בלי
  }

  _fontReady = true;
}

function setHebrewFont(doc, style = "normal", size = 12) {
  doc.setFont("NotoSansHebrew", style);
  doc.setFontSize(size);
}

function rightText(doc, text, xRight, y, opts = {}) {
  // כתיבה מיושרת לימין + RTL fix
  const t = rtlFix(text);
  doc.text(t, xRight, y, { align: "right", ...opts });
}

function splitRightText(doc, text, maxW) {
  // splitTextToSize עובד LTR, אבל עדיין שימושי לשבירת שורות.
  // נשבור ואז נהפוך כל שורה בנפרד עבור עברית.
  const lines = doc.splitTextToSize(String(text ?? ""), maxW);
  return lines.map(rtlFix);
}

function detectImageFormat(dataUrl) {
  if (typeof dataUrl !== "string") return "JPEG";
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  return "JPEG";
}

// ---------- PDF export ----------
export async function exportPdf(d, photos) {
  const doc = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });

  // טען פונטים עבריים לפני כתיבה
  await ensureHebrewFonts(doc);

  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const xRight = pageW - margin;
  const maxW = pageW - margin * 2;

  let y = 50;

  // כותרת בעברית
  setHebrewFont(doc, "bold", 18);
  rightText(doc, "ביקורת / תרגיל – סיכום", xRight, y);
  y += 24;

  setHebrewFont(doc, "normal", 11);
  rightText(doc, `נוצר: ${formatHeDate(new Date())}`, xRight, y);
  y += 18;

  const m = d.meta || {};
  rightText(doc, `סוג: ${d.type || "—"}`, xRight, y); y += 16;
  rightText(doc, `מבצע: ${m.name || "—"} | תפקיד: ${m.role || "—"}`, xRight, y); y += 16;
  rightText(doc, `גזרה: ${m.sector || "—"} | כוח: ${m.force || "—"}`, xRight, y); y += 18;

  // ביקורת קצה: ציונים + ממוצע + תרגול הכוח
  if (d.type === "ביקורת קצה מבצעי" && d.audit) {
    const a = d.audit;
    const avg = avgAudit(a);

    setHebrewFont(doc, "bold", 13);
    rightText(doc, `דירוגים${avg != null ? ` (ממוצע: ${avg}/5)` : ""}`, xRight, y);
    y += 14;

    setHebrewFont(doc, "normal", 11);

    const rows = [
      ["1. נראות הכוח", a.appearance],
      ["2. שמירה על מאמ״ץ", a.discipline],
      ["3. הכרת הגזרה והיסטוריה", a.knowledge],
      ["4. תקינות ומוכנות", a.readiness],
      ["5. ניקיון העמדה", a.cleanliness],
      ["6. איכות שילוח המשימה", a.missionDeliveryQuality],
      ["7. בקיאות במשימה", a.missionMastery],
    ];

    for (const [k, v] of rows) {
      rightText(doc, `${k}: ${scoreToStars(v)} (${v ?? "—"})`, xRight, y);
      y += 14;
      if (y > 770) { doc.addPage(); y = 50; setHebrewFont(doc, "normal", 11); }
    }

    const ft = a.forceTraining || {};
    const trained = ft.trained === "yes" ? "כן" : ft.trained === "no" ? "לא" : "—";
    const tType =
      ft.trainingType === "methodical" ? "מתודי" :
      ft.trainingType === "practical" ? "מעשי" : "—";

    y += 6;
    rightText(doc, `תרגול הכוח: ${trained}${ft.trained === "yes" ? ` (${tType})` : ""}`, xRight, y);
    y += 18;
  }

  // נקודות לשימור
  if (d.keep?.length) {
    setHebrewFont(doc, "bold", 13);
    rightText(doc, "נקודות לשימור", xRight, y); y += 14;

    setHebrewFont(doc, "normal", 11);
    for (const [i, t] of d.keep.slice(0, 3).entries()) {
      const lines = splitRightText(doc, `${i + 1}. ${t}`, maxW);
      for (const line of lines) {
        rightText(doc, line, xRight, y);
        y += 14;
        if (y > 770) { doc.addPage(); y = 50; setHebrewFont(doc, "normal", 11); }
      }
    }
    y += 8;
  }

  // נקודות לשיפור
  if (d.improve?.length) {
    setHebrewFont(doc, "bold", 13);
    rightText(doc, "נקודות לשיפור", xRight, y); y += 14;

    setHebrewFont(doc, "normal", 11);
    for (const [i, t] of d.improve.slice(0, 3).entries()) {
      const lines = splitRightText(doc, `${i + 1}. ${t}`, maxW);
      for (const line of lines) {
        rightText(doc, line, xRight, y);
        y += 14;
        if (y > 770) { doc.addPage(); y = 50; setHebrewFont(doc, "normal", 11); }
      }
    }
    y += 8;
  }

  // הערות
  if (d.notes) {
    setHebrewFont(doc, "bold", 13);
    rightText(doc, "הערות", xRight, y); y += 14;

    setHebrewFont(doc, "normal", 11);
    const lines = splitRightText(doc, d.notes, maxW);
    for (const line of lines) {
      rightText(doc, line, xRight, y);
      y += 14;
      if (y > 770) { doc.addPage(); y = 50; setHebrewFont(doc, "normal", 11); }
    }
    y += 8;
  }

  // תמונות
  for (const p of photos || []) {
    if (y > 650) { doc.addPage(); y = 50; }
    setHebrewFont(doc, "bold", 12);
    rightText(doc, `תמונה: ${p.name || ""}`, xRight, y);
    y += 10;

    const imgW = maxW;
    const imgH = 290;

    const fmt = detectImageFormat(p.dataUrl);
    doc.addImage(p.dataUrl, fmt, margin, y + 6, imgW, imgH, undefined, "FAST");
    y += imgH + 26;
  }

  doc.save(`review_${Date.now()}.pdf`);
}
