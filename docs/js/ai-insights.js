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
        
        const filterStrArr = [];
        if (sectorVal) { filters.sector = sectorVal; filterStrArr.push(`גזרת ${sectorVal}`); }
        if (typeVal) { filters.type = typeVal; filterStrArr.push(`סוג ${typeVal}`); }
        lastAppliedFiltersText = filterStrArr.length > 0 ? "סונן לפי: " + filterStrArr.join(", ") : "ללא סינון (כלל הנתונים)";

        try {
            const res = await askInsightsFn({ question, filters });
            const { answer, records } = res.data;

            lastAnswer = answer;
            resultContent.textContent = answer;

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
                resultContent.textContent = "❌ גישה נדחתה: עליך להיות מחובר כמנהל מורשה כדי להשתמש בינשוף.";
                if (window.showLoginModal) window.showLoginModal();
            } else if (errMsg.includes("FAILED_PRECONDITION")) {
                resultContent.textContent = "❌ שגיאת מערכת (אינדקס חסר): אנא פנה למנהל המערכת להקמת האינדקס ב-Firestore.";
            } else {
                resultContent.textContent = "❌ שגיאה בתקשורת עם הינשוף. נסה שוב בעוד רגע.";
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
