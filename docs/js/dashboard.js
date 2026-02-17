// public/js/dashboard.js
import { functions } from "./firebase-init.js";
import { loginGoogle, logout, watchAuth } from "./auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-functions.js";

const el = (id)=>document.getElementById(id);
const status = el("dashStatus");

let chart;

function renderChart(labels, values){
  const ctx = document.getElementById("chart");
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label:"כמות", data: values }]
    },
    options: {
      responsive:true,
      plugins:{ legend:{ display:true } },
      scales:{ y:{ beginAtZero:true } }
    }
  });
}

function renderTable(obj){
  const entries = Object.entries(obj).sort((a,b)=>b[1]-a[1]);
  el("table").textContent = entries.map(([k,v])=>`${k}: ${v}`).join("\n") || "אין נתונים";
}

watchAuth((u)=>{
  el("loginBtn").classList.toggle("hidden", !!u);
  el("logoutBtn").classList.toggle("hidden", !u);
});

el("loginBtn").addEventListener("click", async ()=>{
  try{
    status.textContent = "מתחבר...";
    await loginGoogle();
    status.textContent = "✅ התחברת. עכשיו ניתן לטעון נתונים.";
  }catch(e){
    console.error(e);
    status.textContent = "❌ התחברות נכשלה";
  }
});

el("logoutBtn").addEventListener("click", async ()=>{
  await logout();
  status.textContent = "התנתקת";
});

el("loadBtn").addEventListener("click", async ()=>{
  try{
    status.textContent = "טוען...";
    const groupBy = el("groupBy").value;
    const daysBack = Number(el("daysBack").value);

    const getStats = httpsCallable(functions, "getStats");
    const res = await getStats({ groupBy, daysBack });

    const counts = res.data?.counts || {};
    renderTable(counts);
    renderChart(Object.keys(counts), Object.values(counts));

    status.textContent = "✅ נטען";
  }catch(e){
    console.error(e);
    status.textContent = "❌ אין הרשאה / תקלה בשרת";
  }
});
