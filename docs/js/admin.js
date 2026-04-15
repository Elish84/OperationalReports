// public/js/admin.js
import { fetchLists, updateList, LISTS_META } from "./lists.js";
import { watchAuth } from "./auth.js";

const el = (id) => document.getElementById(id);
const container = el("listsContainer");
const statusDiv = el("adminStatus");

let activeLists = {};

function h(s) {
  return String(s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

async function renderAdmin() {
  try {
    statusDiv.textContent = "טוען רשימות...";
    activeLists = await fetchLists();
    statusDiv.textContent = "✅ הרשימות נטענו. ניתן להוסיף או להסיר.";
    
    container.innerHTML = "";
    
    for (const [key, label] of Object.entries(LISTS_META)) {
      const arr = activeLists[key] || [];
      const card = document.createElement("div");
      card.className = "card list-card";
      
      const title = document.createElement("h3");
      title.textContent = "ניהול: " + label;
      card.appendChild(title);
      
      const listDiv = document.createElement("div");
      
      const renderItems = () => {
        listDiv.innerHTML = "";
        activeLists[key].forEach((item, index) => {
          const row = document.createElement("div");
          row.className = "list-item";
          row.innerHTML = `
            <span>${h(item)}</span>
            <button class="del-btn" data-index="${index}">מחק</button>
          `;
          row.querySelector(".del-btn").addEventListener("click", () => removeItem(key, index, renderItems));
          listDiv.appendChild(row);
        });
      };
      
      renderItems();
      card.appendChild(listDiv);
      
      // Add form
      const addRow = document.createElement("div");
      addRow.className = "add-row";
      addRow.innerHTML = `
        <input type="text" placeholder="ערך חדש ל${h(label)}" />
        <button class="primary">הוסף</button>
      `;
      const inputEl = addRow.querySelector("input");
      const addBtn = addRow.querySelector("button");
      
      const doAdd = () => {
        const val = inputEl.value.trim();
        if (!val) return;
        if (activeLists[key].includes(val)) {
          alert("ערך זה כבר קיים");
          return;
        }
        addItem(key, val, renderItems);
        inputEl.value = "";
      };
      
      addBtn.addEventListener("click", doAdd);
      inputEl.addEventListener("keypress", (e) => {
        if (e.key === "Enter") doAdd();
      });
      
      card.appendChild(addRow);
      container.appendChild(card);
    }
    
  } catch (err) {
    console.error(err);
    statusDiv.textContent = "❌ שגיאה בטעינת הרשימות. אין הרשאה או תקלת רשת.";
  }
}

async function removeItem(listKey, index, reRenderCb) {
  if (!confirm("האם אתה בטוח שברצונך למחוק פריט זה?")) return;
  const original = [...activeLists[listKey]];
  activeLists[listKey].splice(index, 1);
  try {
    statusDiv.textContent = "שומר שינויים...";
    await updateList(listKey, activeLists[listKey]);
    statusDiv.textContent = "✅ נשמר בהצלחה.";
    reRenderCb();
  } catch (e) {
    statusDiv.textContent = "❌ שגיאה בשמירה.";
    activeLists[listKey] = original; // revert
    reRenderCb();
  }
}

async function addItem(listKey, value, reRenderCb) {
  const original = [...activeLists[listKey]];
  activeLists[listKey].push(value);
  try {
    statusDiv.textContent = "שומר שינויים...";
    await updateList(listKey, activeLists[listKey]);
    statusDiv.textContent = "✅ נשמר בהצלחה.";
    reRenderCb();
  } catch (e) {
    statusDiv.textContent = "❌ שגיאה בשמירה.";
    activeLists[listKey] = original; // revert
    reRenderCb();
  }
}

watchAuth((u) => {
  if (u && !u.isAnonymous) {
    renderAdmin();
  }
});
