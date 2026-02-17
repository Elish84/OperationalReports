// public/js/ui.js
const pad = (n) => String(n).padStart(2,"0");
function formatNow(){
  const d = new Date();
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

document.getElementById("autoDt").textContent = `🕒 ${formatNow()}`;

const typeSel = document.getElementById("type");
const auditCard = document.getElementById("auditCard");

function toggleAudit(){
  const isAudit = typeSel.value === "ביקורת קצה מבצעי";
  auditCard.classList.toggle("hidden", !isAudit);
}
typeSel.addEventListener("change", toggleAudit);
toggleAudit();

// populate rating selects
const ratings = [
  { label:"⭐", v:1 },
  { label:"⭐⭐", v:2 },
  { label:"⭐⭐⭐", v:3 },
  { label:"⭐⭐⭐⭐", v:4 },
  { label:"⭐⭐⭐⭐⭐", v:5 }
];
["r1","r2","r3","r4","r5"].forEach(id=>{
  const sel = document.getElementById(id);
  ratings.forEach(r=>{
    const o = document.createElement("option");
    o.value = r.v;
    o.textContent = r.label;
    sel.appendChild(o);
  });
  sel.value = "3";
});
