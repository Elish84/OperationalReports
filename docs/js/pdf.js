// public/js/pdf.js (v2) — Hebrew PDF + traffic-light ratings + weighted score
import "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

const { jsPDF } = window.jspdf;

// ---------- Rating helpers (UI/WA/PDF) ----------
const clamp1to5 = (n) => Math.max(1, Math.min(5, Number(n) || 0));
const scoreToIcon = (n) => {
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

const pad = (n) => String(n).padStart(2, "0");
function formatHeDate(d = new Date()) {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------- WhatsApp ----------
export function buildWhatsappText(d) {
  const m = d.meta || {};
  const lines = [];

  const scores = d.score || computeScores(d.audit);
  const overall100 = scores?.overall100 ?? null;

  lines.push(`🚨*ביקורת/תרגיל*🚨`);
  lines.push(`תאריך ושעה: ${formatHeDate(new Date())}`);
  lines.push(`סוג: ${d.type || "—"}`);
  lines.push(`מבצע: ${m.name || "—"} (${m.role || "—"})`);
  lines.push(`גזרה: ${m.sector || "—"}`);
  if (m.force) lines.push(`כוח: ${m.force}`);

  // תרגולים/תרגילים — תיאור + קצת אימוג'ים
  if (d.type !== "ביקורת קצה מבצעי") {
    if (d.exerciseDescription) {
      lines.push("");
      lines.push("📝 *תיאור התרגול:*" );
      lines.push(d.exerciseDescription);
    }
  }

  if (d.type === "ביקורת קצה מבצעי" && d.audit) {
    lines.push("");
    lines.push(`*ציון סופי:* ${overall100 ?? "—"}`);

    const a = d.audit;

    lines.push("");
    lines.push(`📌*מבצעיות (80%)*`);
    lines.push(`1. מיקום+שפה+גזרה: ${scoreToIcon(a.posSector)} (${a.posSector ?? "—"})`);
    lines.push(`2. תדריך משימה: ${scoreToIcon(a.missionBriefing)} (${a.missionBriefing ?? "—"})`);
    lines.push(`3. היסטוריה גזרתית: ${scoreToIcon(a.sectorHistory)} (${a.sectorHistory ?? "—"})`);
    lines.push(`4. הבנת האיום: ${scoreToIcon(a.threatUnderstanding)} (${a.threatUnderstanding ?? "—"})`);
    lines.push(`5. נראות ודיגום: ${scoreToIcon(a.appearance)} (${a.appearance ?? "—"})`);
    lines.push(`6. עקרון המאמ״ץ: ${scoreToIcon(a.effort)} (${a.effort ?? "—"})`);
    lines.push(`7. תרגולות ומקת״גים: ${scoreToIcon(a.drills)} (${a.drills ?? "—"})`);
    lines.push(`8. הופ״א: ${scoreToIcon(a.roe)} (${a.roe ?? "—"})`);

    const ft = a.forceTraining || {};
    const trained = ft.trained === "yes" ? "כן" : ft.trained === "no" ? "לא" : "—";
    const tType =
      ft.trainingType === "methodical" ? "מתודי" :
      ft.trainingType === "practical" ? "מעשי" : "—";
    lines.push(`תרגול הכוח: ${trained}${ft.trained === "yes" ? ` (${tType})` : ""}`);

    lines.push("");
    lines.push(`📌*תקשוב (10%)*`);
    lines.push(`9. ליונט/תיק משימה/אלפ״א: ${scoreToIcon(a.systems)} (${a.systems ?? "—"})`);
    lines.push(`10. קשר: ${scoreToIcon(a.communication)} (${a.communication ?? "—"})`);

    lines.push("");
    lines.push(`📌*מודיעין (5%)*`);
    lines.push(`11. עזרים בעמדה: ${scoreToIcon(a.intelTools)} (${a.intelTools ?? "—"})`);

    lines.push("");
    lines.push(`📌*רפואה (5%)*`);
    lines.push(`12. רפואה: ${scoreToIcon(a.medical)} (${a.medical ?? "—"})`);
  }

  if (d.gaps) {
    lines.push("");
    lines.push(`🧩 *פערים שעלו מהכוח:*`);
    lines.push(d.gaps);
  }

  if (d.keep?.length) {
    lines.push("");
    lines.push("💡 *נק׳ לשימור:*");
    d.keep.slice(0, 3).forEach((x) => lines.push(`• ${x}`));
  }

  if (d.improve?.length) {
    lines.push("");
    lines.push("🛠️ *נק׳ לשיפור:*");
    d.improve.slice(0, 3).forEach((x) => lines.push(`• ${x}`));
  }

  if (d.notes) {
    lines.push("");
    lines.push("🗒️ *הערות:*");
    lines.push(d.notes);
  }

  return lines.join("\n");
}

// ---------- PDF Hebrew font + RTL helpers ----------
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
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function hasHebrew(text) {
  return /[\u0590-\u05FF]/.test(String(text || ""));
}

// RTL fix ל-jsPDF:
// המטרה היא להציג עברית תקינה בלי "כתב ראי".
// הפתרון כאן: שומרים על סדר המילים, אבל הופכים תווים בתוך מילים עבריות.
function rtlFix(text) {
  const s = String(text ?? "");
  if (!hasHebrew(s)) return s;

  // שומר על רווחים רציפים
  const parts = s.split(/(\s+)/);
  return parts
    .map((p) => {
      if (!p || /^\s+$/.test(p)) return p;
      if (!hasHebrew(p)) return p;
      return p.split("").reverse().join("");
    })
    .join("");
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
  } catch {
    // Bold optional
  }

  _fontReady = true;
}

function setHebrewFont(doc, style = "normal", size = 12) {
  doc.setFont("NotoSansHebrew", style);
  doc.setFontSize(size);
}

function rightText(doc, text, xRight, y, opts = {}) {
  doc.text(rtlFix(text), xRight, y, { align: "right", ...opts });
}

function splitRightLines(doc, text, maxW) {
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
  await ensureHebrewFonts(doc);

  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const xRight = pageW - margin;
  const maxW = pageW - margin * 2;

  const m = d.meta || {};
  const scores = d.score || computeScores(d.audit);

  let y = 52;

  setHebrewFont(doc, "bold", 18);
  rightText(doc, "ביקורת / תרגיל – סיכום", xRight, y);
  y += 24;

  setHebrewFont(doc, "normal", 11);
  rightText(doc, `נוצר: ${formatHeDate(new Date())}`, xRight, y);
  y += 18;

  rightText(doc, `סוג: ${d.type || "—"}`, xRight, y); y += 16;
  rightText(doc, `מבצע: ${m.name || "—"} | תפקיד: ${m.role || "—"}`, xRight, y); y += 16;
  rightText(doc, `גזרה: ${m.sector || "—"} | כוח: ${m.force || "—"}`, xRight, y); y += 18;

  // תרגולים/תרגילים — תיאור תרגול
  if (d.type !== "ביקורת קצה מבצעי" && d.exerciseDescription) {
    if (y > 740) { doc.addPage(); y = 52; }
    setHebrewFont(doc, "bold", 13);
    rightText(doc, "תיאור התרגול", xRight, y); y += 14;
    setHebrewFont(doc, "normal", 11);
    const lines = splitRightLines(doc, d.exerciseDescription, maxW);
    for (const ln of lines) {
      rightText(doc, ln, xRight, y); y += 14;
      if (y > 770) { doc.addPage(); y = 52; setHebrewFont(doc, "normal", 11); }
    }
    y += 10;
  }

  if (d.type === "ביקורת קצה מבצעי" && d.audit) {
    setHebrewFont(doc, "bold", 13);
    rightText(doc, `ציון סופי: ${scores?.overall100 ?? "—"}  |  מבצעיות: ${scores?.operational100 ?? "—"}  תקשוב: ${scores?.tech100 ?? "—"}  מודיעין: ${scores?.intel100 ?? "—"}  רפואה: ${scores?.medical100 ?? "—"}`, xRight, y);
    y += 18;

    const a = d.audit;
    const sections = [
      { title: "📌 מבצעיות (80%)", rows: [
        ["1. מיקום העמדה + שפה משותפת + הכרת הגזרה", a.posSector],
        ["2. תדריך משימה", a.missionBriefing],
        ["3. היסטוריה גזרתית", a.sectorHistory],
        ["4. הבנת האיום", a.threatUnderstanding],
        ["5. נראות ודיגום", a.appearance],
        ["6. עקרון המאמ״ץ", a.effort],
        ["7. תרגולות ומקת״גים", a.drills],
        ["8. הופ״א", a.roe],
      ]},
      { title: "📌 תקשוב (10%)", rows: [
        ["9. ליונט/תיק משימה/אלפ״א/משיב מיקום", a.systems],
        ["10. קשר", a.communication],
      ]},
      { title: "📌 מודיעין (5%)", rows: [
        ["11. עזרים בעמדה", a.intelTools],
      ]},
      { title: "📌 רפואה (5%)", rows: [
        ["12. רפואה", a.medical],
      ]},
    ];

    for (const sec of sections) {
      if (y > 760) { doc.addPage(); y = 52; }
      setHebrewFont(doc, "bold", 13);
      rightText(doc, sec.title, xRight, y); y += 14;
      setHebrewFont(doc, "normal", 11);

      for (const [label, val] of sec.rows) {
        const line = `${label}: ${scoreToIcon(val)} (${val ?? "—"})`;
        const lines = splitRightLines(doc, line, maxW);
        for (const ln of lines) {
          rightText(doc, ln, xRight, y);
          y += 14;
          if (y > 770) { doc.addPage(); y = 52; setHebrewFont(doc, "normal", 11); }
        }
      }

      // תרגול הכוח אחרי מבצעיות
      if (sec.title.includes("מבצעיות")) {
        const ft = a.forceTraining || {};
        const trained = ft.trained === "yes" ? "כן" : ft.trained === "no" ? "לא" : "—";
        const tType =
          ft.trainingType === "methodical" ? "מתודי" :
          ft.trainingType === "practical" ? "מעשי" : "—";
        y += 4;
        rightText(doc, `תרגול הכוח: ${trained}${ft.trained === "yes" ? ` (${tType})` : ""}`, xRight, y);
        y += 16;
      } else {
        y += 10;
      }
    }
  }

  // פערים מהכוח
  if (d.gaps) {
    if (y > 740) { doc.addPage(); y = 52; }
    setHebrewFont(doc, "bold", 13);
    rightText(doc, "פערים שעלו מהכוח", xRight, y); y += 14;
    setHebrewFont(doc, "normal", 11);
    const lines = splitRightLines(doc, d.gaps, maxW);
    for (const ln of lines) {
      rightText(doc, ln, xRight, y); y += 14;
      if (y > 770) { doc.addPage(); y = 52; setHebrewFont(doc, "normal", 11); }
    }
    y += 8;
  }

  // נק׳ לשימור
  if (d.keep?.length) {
    if (y > 740) { doc.addPage(); y = 52; }
    setHebrewFont(doc, "bold", 13);
    rightText(doc, "נקודות לשימור", xRight, y); y += 14;
    setHebrewFont(doc, "normal", 11);
    for (const t of d.keep.slice(0, 3)) {
      const bullet = `• ${t}`;
      const lines = splitRightLines(doc, bullet, maxW);
      for (const ln of lines) {
        rightText(doc, ln, xRight, y); y += 14;
        if (y > 770) { doc.addPage(); y = 52; setHebrewFont(doc, "normal", 11); }
      }
    }
    y += 8;
  }

  // נק׳ לשיפור
  if (d.improve?.length) {
    if (y > 740) { doc.addPage(); y = 52; }
    setHebrewFont(doc, "bold", 13);
    rightText(doc, "נקודות לשיפור", xRight, y); y += 14;
    setHebrewFont(doc, "normal", 11);
    for (const t of d.improve.slice(0, 3)) {
      const bullet = `• ${t}`;
      const lines = splitRightLines(doc, bullet, maxW);
      for (const ln of lines) {
        rightText(doc, ln, xRight, y); y += 14;
        if (y > 770) { doc.addPage(); y = 52; setHebrewFont(doc, "normal", 11); }
      }
    }
    y += 8;
  }

  // הערות
  if (d.notes) {
    if (y > 740) { doc.addPage(); y = 52; }
    setHebrewFont(doc, "bold", 13);
    rightText(doc, "הערות", xRight, y); y += 14;
    setHebrewFont(doc, "normal", 11);
    const lines = splitRightLines(doc, d.notes, maxW);
    for (const ln of lines) {
      rightText(doc, ln, xRight, y); y += 14;
      if (y > 770) { doc.addPage(); y = 52; setHebrewFont(doc, "normal", 11); }
    }
    y += 8;
  }

  // Photos
  for (const p of photos || []) {
    if (y > 650) { doc.addPage(); y = 52; }
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
