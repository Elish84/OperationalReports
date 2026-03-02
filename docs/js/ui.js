// public/js/ui.js (v2)
const pad = (n) => String(n).padStart(2, "0");
function formatNow() {
  const d = new Date();
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

document.getElementById("autoDt").textContent = `🕒 ${formatNow()}`;

const typeSel = document.getElementById("type");
const auditCard = document.getElementById("auditCard");
const exerciseDescriptionWrap = document.getElementById("exerciseDescriptionWrap");
const scoreBadge = document.getElementById("scoreBadge");
const scoreBreakdown = document.getElementById("scoreBreakdown");

function toggleAudit() {
  const isAudit = typeSel.value === "ביקורת קצה מבצעי";
  auditCard.classList.toggle("hidden", !isAudit);
  // בשאר הסוגים (תרגולים/תרגילים) מציגים תיאור תרגול
  exerciseDescriptionWrap?.classList.toggle("hidden", isAudit);
}
typeSel.addEventListener("change", toggleAudit);
toggleAudit();

// דירוג “רמזור”
const ratings = [
  { label: "🔴", v: 1 }, // גרוע
  { label: "⚠️", v: 2 }, // בינוני
  { label: "🙂", v: 3 }, // טוב
  { label: "✅", v: 4 }, // טוב מאוד
  { label: "🟢", v: 5 }, // מצוין
];

const RATING_IDS = ["r1","r2","r3","r4","r5","r6","r7","r8","r9","r10","r11","r12"];

function populateRatings() {
  RATING_IDS.forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    if (sel.options.length === 0) {
      // לא רלוונטי
      const na = document.createElement("option");
      na.value = "na";
      na.textContent = "לא רלוונטי";
      sel.appendChild(na);

      ratings.forEach((r) => {
        const o = document.createElement("option");
        o.value = String(r.v);
        o.textContent = r.label;
        sel.appendChild(o);
      });
    }
    // ברירת מחדל: 3 (טוב)
    sel.value = sel.value || "3";
  });
}

function num(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (el.value === "na") return null;
  const v = Number(el.value);
  return Number.isFinite(v) ? v : null;
}

function avg(ids) {
  const vals = ids.map(num).filter((v) => v != null && v > 0);
  if (!vals.length) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function to100(avg5) {
  if (avg5 == null) return null;
  return Math.round((avg5 / 5) * 100);
}

function updateScoreUI() {
  const opAvg = avg(["r1","r2","r3","r4","r5","r6","r7","r8"]);
  const techAvg = avg(["r9","r10"]);
  const intelAvg = avg(["r11"]);
  const medAvg = avg(["r12"]);

  // Weighted average on 1–5 scale (יחסי: מתחשב רק בנושאים הרלוונטיים)
  const weights = { op: 0.80, tech: 0.10, intel: 0.05, med: 0.05 };
  const parts = [
    { key: "op", avg: opAvg },
    { key: "tech", avg: techAvg },
    { key: "intel", avg: intelAvg },
    { key: "med", avg: medAvg },
  ].filter((p) => p.avg != null);

  const weightedAvg5 = parts.length
    ? parts.reduce((s, p) => s + p.avg * weights[p.key], 0) /
      parts.reduce((s, p) => s + weights[p.key], 0)
    : null;

  const overall100 = to100(weightedAvg5);

  if (scoreBadge) {
    scoreBadge.textContent = overall100 == null ? "ציון סופי: —" : `ציון סופי: ${overall100}`;
  }

  if (scoreBreakdown) {
    const op100 = to100(opAvg);
    const tech100 = to100(techAvg);
    const intel100 = to100(intelAvg);
    const med100 = to100(medAvg);
    scoreBreakdown.textContent =
      `פירוט: מבצעיות ${op100 ?? "—"} (80%) · תקשוב ${tech100 ?? "—"} (10%) · מודיעין ${intel100 ?? "—"} (5%) · רפואה ${med100 ?? "—"} (5%)`;
  }
}

// Force training UI
const forceTrained = document.getElementById("forceTrained");
const forceTrainingTypeWrap = document.getElementById("forceTrainingTypeWrap");
const forceTrainingType = document.getElementById("forceTrainingType");

function toggleForceTrainingType() {
  const show = (forceTrained?.value || "") === "yes";
  forceTrainingTypeWrap?.classList.toggle("hidden", !show);
  if (!show && forceTrainingType) forceTrainingType.value = "";
}
forceTrained?.addEventListener("change", toggleForceTrainingType);
toggleForceTrainingType();

// listeners for score
function bindScoreListeners() {
  RATING_IDS.forEach((id) => {
    const sel = document.getElementById(id);
    sel?.addEventListener("change", updateScoreUI);
  });
}
populateRatings();
bindScoreListeners();
updateScoreUI();
