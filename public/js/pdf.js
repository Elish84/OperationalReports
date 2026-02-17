// public/js/pdf.js
import "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

const { jsPDF } = window.jspdf;

const scoreToStars = (n) => "⭐".repeat(Math.max(1, Math.min(5, Number(n)||0)));

export function buildWhatsappText(d){
  const lines = [];
  lines.push(`📋 ${d.type}`);
  lines.push(`👤 ${d.meta.name} (${d.meta.role})`);
  lines.push(`📍 ${d.meta.sector}`);
  if (d.meta.force) lines.push(`🧩 כוח: ${d.meta.force}`);
  if (d.audit){
    lines.push("");
    lines.push("🧪 דירוגים:");
    lines.push(`1) נראות: ${scoreToStars(d.audit.appearance)}`);
    lines.push(`2) מאמ״ץ: ${scoreToStars(d.audit.discipline)}`);
    lines.push(`3) גזרה: ${scoreToStars(d.audit.knowledge)}`);
    lines.push(`4) תקינות: ${scoreToStars(d.audit.readiness)}`);
    lines.push(`5) ניקיון: ${scoreToStars(d.audit.cleanliness)}`);
  }
  if (d.keep?.length){
    lines.push("");
    lines.push("✅ נק׳ לשימור:");
    d.keep.slice(0,3).forEach((x,i)=>lines.push(`${i+1}. ${x}`));
  }
  if (d.improve?.length){
    lines.push("");
    lines.push("🛠 נק׳ לשיפור:");
    d.improve.slice(0,3).forEach((x,i)=>lines.push(`${i+1}. ${x}`));
  }
  if (d.notes){
    lines.push("");
    lines.push(`📝 הערות: ${d.notes}`);
  }
  return lines.join("\n");
}

export async function exportPdf(d, photos){
  const doc = new jsPDF({ orientation:"p", unit:"pt", format:"a4" });

  let y = 40;
  const x = 40;
  const maxW = 515;

  doc.setFont("helvetica","bold");
  doc.setFontSize(16);
  doc.text("Operational Review / Exercise", x, y); y += 22;

  doc.setFont("helvetica","normal");
  doc.setFontSize(11);
  const dt = new Date().toLocaleString("he-IL");
  doc.text(`Generated: ${dt}`, x, y); y += 18;

  doc.text(`Type: ${d.type}`, x, y); y += 16;
  doc.text(`Name: ${d.meta.name} | Role: ${d.meta.role}`, x, y); y += 16;
  doc.text(`Sector: ${d.meta.sector} | Force: ${d.meta.force || "-"}`, x, y); y += 18;

  if (d.audit){
    doc.setFont("helvetica","bold");
    doc.text("Audit Ratings", x, y); y += 14;
    doc.setFont("helvetica","normal");
    const rows = [
      ["Appearance", d.audit.appearance],
      ["Effort (Ma'amatz)", d.audit.discipline],
      ["Sector Knowledge", d.audit.knowledge],
      ["Readiness", d.audit.readiness],
      ["Cleanliness", d.audit.cleanliness],
    ];
    rows.forEach(([k,v])=>{
      doc.text(`${k}: ${scoreToStars(v)} (${v})`, x, y); y += 14;
    });
    y += 8;
  }

  if (d.keep?.length){
    doc.setFont("helvetica","bold"); doc.text("Keep", x, y); y += 14;
    doc.setFont("helvetica","normal");
    d.keep.slice(0,3).forEach((t,i)=>{ doc.text(`${i+1}. ${t}`, x, y, { maxWidth: maxW }); y += 14; });
    y += 6;
  }

  if (d.improve?.length){
    doc.setFont("helvetica","bold"); doc.text("Improve", x, y); y += 14;
    doc.setFont("helvetica","normal");
    d.improve.slice(0,3).forEach((t,i)=>{ doc.text(`${i+1}. ${t}`, x, y, { maxWidth: maxW }); y += 14; });
    y += 6;
  }

  if (d.notes){
    doc.setFont("helvetica","bold"); doc.text("Notes", x, y); y += 14;
    doc.setFont("helvetica","normal");
    const lines = doc.splitTextToSize(d.notes, maxW);
    doc.text(lines, x, y); y += lines.length * 12 + 10;
  }

  // Photos
  for (const p of photos){
    if (y > 740){ doc.addPage(); y = 40; }
    doc.setFont("helvetica","bold");
    doc.text(`Photo: ${p.name}`, x, y); y += 10;

    // Fit image in box
    const imgW = 515, imgH = 290;
    doc.addImage(p.dataUrl, "JPEG", x, y+6, imgW, imgH, undefined, "FAST");
    y += imgH + 26;
  }

  doc.save(`review_${Date.now()}.pdf`);
}
