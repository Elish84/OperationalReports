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
      if (!activeLists[key]) activeLists[key] = [];
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
          
          if (key === "deployments") {
            const isObj = typeof item === 'object' && item !== null;
            const name = isObj ? item.name : item;
            const active = isObj ? item.active : true;
            const sectors = isObj && Array.isArray(item.sectors) ? item.sectors : ["", "", "", "", ""];
            
            const sectorSelects = [0,1,2,3,4].map(i => {
              const current = sectors[i] || "";
              let options = `<option value="">-- בחר גזרה --</option>`;
              (activeLists.sectors || []).forEach(s => {
                options += `<option value="${h(s)}" ${s === current ? 'selected' : ''}>${h(s)}</option>`;
              });
              return `<select class="sec-select" data-dep-index="${index}" data-sec-index="${i}" style="width:120px; font-size:12px; padding:2px">${options}</select>`;
            }).join("");

            row.innerHTML = `
              <div style="display:flex; flex-direction:column; gap:5px; width:100%; padding:8px; border-bottom:1px solid #333">
                <div style="display:flex; justify-content:space-between; align-items:center">
                  <span style="font-weight:bold">${h(name)}</span>
                  <div style="display:flex; gap:10px; align-items:center">
                    <button class="toggle-btn ${active ? 'primary' : 'secondary'}" data-index="${index}">
                      ${active ? 'פעיל' : 'לא פעיל'}
                    </button>
                    <button class="del-btn" data-index="${index}">מחק</button>
                  </div>
                </div>
                <div style="display:flex; gap:5px; flex-wrap:wrap; margin-top:5px">
                  <div style="font-size:12px; color:#aaa; width:100%">גזרות משויכות:</div>
                  ${sectorSelects}
                </div>
              </div>
            `;
            row.querySelector(".toggle-btn").addEventListener("click", () => toggleDeployment(index, renderItems));
            row.querySelectorAll(".sec-select").forEach(sel => {
              sel.addEventListener("change", (e) => {
                const depIdx = parseInt(e.target.dataset.depIndex);
                const secIdx = parseInt(e.target.dataset.secIndex);
                updateDeploymentSector(depIdx, secIdx, e.target.value, renderItems);
              });
            });
          } else {
            row.innerHTML = `
              <span>${h(item)}</span>
              <button class="del-btn" data-index="${index}">מחק</button>
            `;
          }
          row.querySelector(".del-btn").addEventListener("click", () => removeItem(key, index, renderItems));
          listDiv.appendChild(row);
        });
      };
      
      renderItems();
      card.appendChild(listDiv);
      
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
        const exists = key === "deployments" 
          ? activeLists[key].some(item => (typeof item === 'object' ? item.name : item) === val)
          : activeLists[key].includes(val);
        if (exists) {
          alert("ערך זה כבר קיים");
          return;
        }
        addItem(key, val, renderItems);
        inputEl.value = "";
      };
      
      addBtn.addEventListener("click", doAdd);
      inputEl.addEventListener("keypress", (e) => { if (e.key === "Enter") doAdd(); });
      
      card.appendChild(addRow);
      container.appendChild(card);
    }
  } catch (err) {
    console.error(err);
    statusDiv.textContent = "❌ שגיאה בטעינת הרשימות.";
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
    activeLists[listKey] = original;
    reRenderCb();
  }
}

async function addItem(listKey, value, reRenderCb) {
  const original = [...activeLists[listKey]];
  const newItem = listKey === "deployments" ? { name: value, active: true, sectors: ["", "", "", "", ""] } : value;
  activeLists[listKey].push(newItem);
  try {
    statusDiv.textContent = "שומר שינויים...";
    await updateList(listKey, activeLists[listKey]);
    statusDiv.textContent = "✅ נשמר בהצלחה.";
    reRenderCb();
  } catch (e) {
    statusDiv.textContent = "❌ שגיאה בשמירה.";
    activeLists[listKey] = original;
    reRenderCb();
  }
}

async function toggleDeployment(index, reRenderCb) {
  const item = activeLists.deployments[index];
  const name = typeof item === 'object' ? item.name : item;
  const currentActive = typeof item === 'object' ? item.active : true;
  const sectors = typeof item === 'object' ? (item.sectors || ["","","","",""]) : ["","","","",""];
  activeLists.deployments[index] = { name, active: !currentActive, sectors };
  try {
    statusDiv.textContent = "שומר שינויים...";
    await updateList("deployments", activeLists.deployments);
    statusDiv.textContent = "✅ נשמר בהצלחה.";
    reRenderCb();
  } catch (e) {
    statusDiv.textContent = "❌ שגיאה בשמירה.";
    activeLists.deployments[index] = item;
    reRenderCb();
  }
}

async function updateDeploymentSector(depIndex, secIndex, newValue, reRenderCb) {
  const item = activeLists.deployments[depIndex];
  const name = typeof item === 'object' ? item.name : item;
  const active = typeof item === 'object' ? item.active : true;
  const sectors = typeof item === 'object' && Array.isArray(item.sectors) ? [...item.sectors] : ["","","","",""];
  sectors[secIndex] = newValue;
  activeLists.deployments[depIndex] = { name, active, sectors };
  try {
    statusDiv.textContent = "מעדכן גזרות...";
    await updateList("deployments", activeLists.deployments);
    statusDiv.textContent = "✅ נשמר.";
  } catch (e) {
    statusDiv.textContent = "❌ שגיאה בעדכון.";
    activeLists.deployments[depIndex] = item;
    reRenderCb();
  }
}

watchAuth((u) => { if (u && !u.isAnonymous) renderAdmin(); });
