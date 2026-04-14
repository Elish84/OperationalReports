import { db, auth, functions } from "./firebase-init.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-functions.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

import { initGlobalAuthUI } from "./auth.js";

const askInsightsFn = httpsCallable(functions, 'askInsights');
const el = (id) => document.getElementById(id);

async function isAdmin(uid) {
    if (!uid) return false;
    const ref = doc(db, "admins", uid);
    const snap = await getDoc(ref);
    return snap.exists();
}

export async function initAiInsights() {
    // Ensure Auth UI is initialized on the AI page
    initGlobalAuthUI(false);

    const askBtn = el("askAiBtn");
    if (!askBtn) return;

    const questionInput = el("aiQuestion");
    const resultWrap = el("aiResult");
    const resultContent = el("aiResultContent");
    const filterBtn = el("toggleAiFilters");
    const filterWrap = el("aiFiltersWrap");
    const debugArea = el("adminDebugArea");
    const debugContent = el("debugContent");
    
    const waExportArea = el("waExportArea");
    const waExportBtn = el("waExportAiBtn");

    filterBtn.onclick = () => filterWrap.classList.toggle("hidden");

    let lastAnswer = "";
    let lastAppliedFiltersText = "";

    askBtn.onclick = async () => {
        // Ensure user is logged in before even trying
        if (!auth.currentUser || auth.currentUser.isAnonymous) {
            if (window.showLoginModal) window.showLoginModal();
            return;
        }

        const question = questionInput.value.trim();
        if (!question) return;

        askBtn.disabled = true;
        askBtn.textContent = "⌛ מעבד נתונים...";
        resultWrap.classList.remove("hidden");
        resultContent.style.display = "block";
        resultContent.textContent = "חושב... זה עשוי לקחת כמה שניות.";
        debugArea.classList.add("hidden");
        if(waExportArea) waExportArea.style.display = "none";

        const filters = {};
        const sectorVal = el("ai_sector").value;
        const typeVal = el("ai_type").value;
        const roleVal = el("ai_role")?.value;
        const forceVal = el("x_sq_search")?.value.trim();
        const daysVal = el("ai_days")?.value;
        
        const filterStrArr = [];
        if (sectorVal) { filters.sector = sectorVal; filterStrArr.push(`גזרת ${sectorVal}`); }
        if (typeVal) { filters.type = typeVal; filterStrArr.push(`סוג ${typeVal}`); }
        if (roleVal) { filters.role = roleVal; filterStrArr.push(`תפקיד ${roleVal}`); }
        if (forceVal) { filters.force = forceVal; filterStrArr.push(`כוח ${forceVal}`); }
        if (daysVal) {
            const start = new Date(Date.now() - Number(daysVal) * 86400000).toISOString();
            filters.dateRange = { start };
            filterStrArr.push(`${daysVal} ימים אחרונים`);
        }
        lastAppliedFiltersText = filterStrArr.length > 0 ? "סונן לפי: " + filterStrArr.join(", ") : "ללא סינון (כלל הנתונים)";

        try {
            function formatOwlResponse(text) {
                if (!text) return "";
                // Bold headers (lines starting with digit+. or those appearing as headers)
                let formatted = text.replace(/^(\d+\..+)$/gm, '<b>$1</b>');
                formatted = formatted.replace(/^([^\w\s].+)$/gm, '<b>$1</b>');

                // Colorize Confidence Levels
                formatted = formatted.replace(/(רמת ביטחון:\s*גבוהה)/g, '<span style="color:#4ade80;font-weight:bold">$1</span>');
                formatted = formatted.replace(/(רמת ביטחון:\s*בינונית)/g, '<span style="color:#fbbf24;font-weight:bold">$1</span>');
                formatted = formatted.replace(/(רמת ביטחון:\s*נמוכה)/g, '<span style="color:#f87171;font-weight:bold">$1</span>');

                return formatted;
            }

            const res = await askInsightsFn({ question, filters });
            const { answer, records } = res.data;

            lastAnswer = answer;
            resultContent.innerHTML = formatOwlResponse(answer);

            if(waExportArea) waExportArea.style.display = "flex";

            // Admin Debug Mode
            const user = auth.currentUser;
            if (user && await isAdmin(user.uid)) {
                debugArea.classList.remove("hidden");
                debugContent.textContent = JSON.stringify({
                    retrieved_count: records?.length || 0,
                    answer_length: answer?.length || 0,
                    records: records
                }, null, 2);
            }

        } catch (err) {
            console.error("AI Error:", err);
            // Handle specific Firebase HttpsError codes if they come through normally
            const errMsg = err.message || "";
            if (errMsg.includes("permission-denied") || errMsg.includes("Unauthenticated") || errMsg.includes("not an admin")) {
                resultContent.innerHTML = "<span style='color:#f87171;'>❌ גישה נדחתה: עליך להיות מחובר כמנהל מורשה כדי להשתמש בינשוף.</span>";
                if (window.showLoginModal) window.showLoginModal();
            } else if (errMsg.includes("FAILED_PRECONDITION") || errMsg.includes("Missing vector index")) {
                let debugUrl = errMsg.match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
                let linkHtml = debugUrl ? `<br><br><a href="${debugUrl[0]}" target="_blank" style="color:#60a5fa; text-decoration:underline;">👉 לחץ כאן ליצירת האינדקס החסר</a>` : "";
                resultContent.innerHTML = `<span style='color:#f87171;'>❌ שגיאת מערכת: המסנן שבחרת דורש 'אינדקס' במסד הנתונים שעדיין לא קיים או נמצא בבנייה. (לוקח כ-5 דקות מרגע השיגור).</span>` + linkHtml;
            } else {
                resultContent.innerHTML = "<span style='color:#f87171;'>❌ שגיאה בתקשורת עם הינשוף. נסה שוב בעוד רגע (ייתכן ותוקף החיבור פג).</span>";
            }
        } finally {
            askBtn.disabled = false;
            askBtn.textContent = "✨ קבל תובנות מלומדות";
        }
    };

    if (waExportBtn) {
        waExportBtn.onclick = () => {
            if (!lastAnswer) return;
            const textToShare = `🦉 *תובנות ינשוף AI 8109*\n` +
                                `━━━━━━━━━━━━━━━\n\n` +
                                `❓ *השאלה שנשאלה:*\n${questionInput.value.trim()}\n\n` +
                                `💡 *תובנות ומסקנות:*\n${lastAnswer}\n\n` +
                                `🔍 *מידע שפולטר:* ${lastAppliedFiltersText}\n\n` +
                                `━━━━━━━━━━━━━━━\n` +
                                `_נוצר ע"י מערכת 8109_`;
            const waUrl = "https://wa.me/?text=" + encodeURIComponent(textToShare);
            window.location.href = waUrl;
        };
    }
}
