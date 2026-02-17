// public/js/dashboard.js
import { db } from "./firebase-init.js";
import { loginEmailPassword, logout, watchAuth } from "./auth.js";
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const el = (id)=>document.getElementById(id);
const dashStatus = el("dashStatus");
const loginStatus = el("loginStatus");

let chart;

function renderChart(labels, values){
  const ctx = document.getElementById("chart");
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label:"כמות", data: values }] },
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

// Helper: attach handler if element exists
function onClick(id, handler){
  const node = el(id);
  if (node) node.addEventListener("click", handler);
}

watchAuth((u)=>{
  // toggle both header + inline buttons (if exist)
  ["loginBtn","loginBtnInline"].forEach(id => el(id)?.classList.toggle("hidden", !!u));
  ["logoutBtn","logoutBtnInline"].forEach(id => el(id)?.classList.toggle("hidden", !u));

  if (loginStatus) {
    loginStatus.textContent = u
      ? `✅ מחובר: ${u.email || "anonymous"}`
      : "🔒 לא מחובר";
  }
});

async function doLogin(){
  try{
    if (loginStatus) loginStatus.textContent = "מתחבר...";
    const email = el("adminEmail")?.value?.trim();
    const pass = el("adminPass")?.value;

    if (!email || !pass) {
      if (loginStatus) loginStatus.textContent = "❌ חסר אימייל או סיסמה";
      return;
    }

    await loginEmailPassword(email, pass);

    if (loginStatus) loginStatus.textContent = "✅ התחברת. אפשר לטעון סטטיסטיקות.";
  }catch(e){
    console.error(e);
    if (loginStatus) loginStatus.textContent = "❌ התחברות נכשלה (בדוק אימייל/סיסמה)";
  }
}

async function doLogout(){
  await logout();
  if (loginStatus) loginStatus.textContent = "התנתקת";
  dashStatus.textContent = "";
  el("table").textContent = "";
  if (chart) chart.destroy();
}

// login/logout handlers (header + inline)
onClick("loginBtn", doLogin);
onClick("loginBtnInline", doLogin);
onClick("logoutBtn", doLogout);
onClick("logoutBtnInline", doLogout);

onClick("loadBtn", async ()=>{
  try{
    dashStatus.textContent = "טוען...";

    const groupBy = el("groupBy").value;
    const daysBack = Number(el("daysBack").value);
    const since = Timestamp.fromDate(new Date(Date.now() - daysBack * 24*60*60*1000));

    // קריאה ישירה ל-Firestore (מוגן ע\"י Rules: read רק ל-admin)
    const qRef = query(
      collection(db, "reviews"),
      where("createdAt", ">=", since)
    );

    const snap = await getDocs(qRef);

    const counts = {};
    snap.forEach(doc => {
      const d = doc.data() || {};
      let key = "לא ידוע";
      if (groupBy === "type") key = d.type || "לא ידוע";
      if (groupBy === "sector") key = d.meta?.sector || "לא ידוע";
      if (groupBy === "role") key = d.meta?.role || "לא ידוע";
      if (groupBy === "name") key = d.meta?.name || "לא ידוע";
      counts[key] = (counts[key] || 0) + 1;
    });

    renderTable(counts);
    renderChart(Object.keys(counts), Object.values(counts));

    dashStatus.textContent = `✅ נטען (${snap.size})`;
  }catch(e){
    console.error(e);
    // אם לא admin תראה לרוב permission-denied
    dashStatus.textContent = "❌ אין הרשאה (אתה לא admin) / תקלה";
  }
});
