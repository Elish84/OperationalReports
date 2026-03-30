// public/js/ui.js (v3)
const pad = (n) => String(n).padStart(2, "0");
function formatNow() {
  const d = new Date();
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

document.getElementById("autoDt").textContent = `🕒 ${formatNow()}`;

const typeSel = document.getElementById("type");
const auditCard = document.getElementById("auditCard");
const hqCard = document.getElementById("hqCard");
const offensiveCard = document.getElementById("offensiveCard");
const exerciseDescriptionWrap = document.getElementById("exerciseDescriptionWrap");
const scoreBadge = document.getElementById("scoreBadge");
const scoreBreakdown = document.getElementById("scoreBreakdown");
const hqScoreBadge = document.getElementById("hqScoreBadge");
const hqScoreBreakdown = document.getElementById("hqScoreBreakdown");

const AUDIT_TYPE = "ביקורת קצה מבצעי";
const HQ_TYPE = "ביקורת חמ״ל";
const OFFENSIVE_TYPE = "סיכום פעילות התקפית ⚔️";

function toggleSections() {
  const type = typeSel.value;
  const isAudit = type === AUDIT_TYPE;
  const isHq = type === HQ_TYPE;
  const isOffensive = type === OFFENSIVE_TYPE;

  auditCard?.classList.toggle("hidden", !isAudit);
  hqCard?.classList.toggle("hidden", !isHq);
  offensiveCard?.classList.toggle("hidden", !isOffensive);
  exerciseDescriptionWrap?.classList.toggle("hidden", isAudit || isHq || isOffensive);

  updateScoreUI();
}
typeSel.addEventListener("change", toggleSections);

const ratings = [
  { label: "🔴", v: 1 },
  { label: "⚠️", v: 2 },
  { label: "🙂", v: 3 },
  { label: "✅", v: 4 },
  { label: "🟢", v: 5 },
];

const AUDIT_RATING_IDS = ["r1","r2","r3","r4","r5","r6","r7","r8","r9","r10","r11","r12"];
const HQ_RATING_IDS = ["hq_r1","hq_r2","hq_r3","hq_r4","hq_r5","hq_r6","hq_r7","hq_r8","hq_r9","hq_r10"];

function populateRatings(ids) {
  ids.forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    if (sel.options.length === 0) {
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

function updateAuditScoreUI() {
  const opAvg = avg(["r1","r2","r3","r4","r5","r6","r7","r8"]);
  const techAvg = avg(["r9","r10"]);
  const intelAvg = avg(["r11"]);
  const medAvg = avg(["r12"]);

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

function updateHqScoreUI() {
  const routineAvg = avg(["hq_r1", "hq_r2"]);
  const drillAvg = avg(["hq_r3","hq_r4","hq_r5","hq_r6","hq_r7","hq_r8","hq_r9","hq_r10"]);
  const weights = { routine: 0.25, drill: 0.75 };
  const parts = [
    { key: "routine", avg: routineAvg },
    { key: "drill", avg: drillAvg },
  ].filter((p) => p.avg != null);

  const weightedAvg5 = parts.length
    ? parts.reduce((s, p) => s + p.avg * weights[p.key], 0) /
      parts.reduce((s, p) => s + weights[p.key], 0)
    : null;

  const overall100 = to100(weightedAvg5);

  if (hqScoreBadge) {
    hqScoreBadge.textContent = overall100 == null ? "ציון סופי: —" : `ציון סופי: ${overall100}`;
  }

  if (hqScoreBreakdown) {
    hqScoreBreakdown.textContent =
      `פירוט: תפקוד שוטף ${to100(routineAvg) ?? "—"} · תרגיל חמ״ל ${to100(drillAvg) ?? "—"}`;
  }
}

function updateScoreUI() {
  const type = typeSel.value;
  if (type === AUDIT_TYPE) updateAuditScoreUI();
  if (type === HQ_TYPE) updateHqScoreUI();
}

const forceTrained = document.getElementById("forceTrained");
const forceTrainingTypeWrap = document.getElementById("forceTrainingTypeWrap");
const forceTrainingType = document.getElementById("forceTrainingType");

function toggleForceTrainingType() {
  const show = (forceTrained?.value || "") === "yes";
  forceTrainingTypeWrap?.classList.toggle("hidden", !show);
  if (!show && forceTrainingType) forceTrainingType.value = "";
}
forceTrained?.addEventListener("change", toggleForceTrainingType);

function bindScoreListeners(ids) {
  ids.forEach((id) => {
    const sel = document.getElementById(id);
    sel?.addEventListener("change", updateScoreUI);
  });
}

populateRatings(AUDIT_RATING_IDS);
populateRatings(HQ_RATING_IDS);
bindScoreListeners(AUDIT_RATING_IDS);
bindScoreListeners(HQ_RATING_IDS);
toggleForceTrainingType();
toggleSections();
