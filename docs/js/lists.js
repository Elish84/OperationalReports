// public/js/lists.js
import { db } from "./firebase-init.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const LISTS_DOC_PATH = "settings/lists";

// Default fallback lists if DB is empty or offline first load
const DEFAULT_LISTS = {
  sectors: ["אלון מורה", "איתמר", "ברכה", "לב השומרון", "אחר"],
  observations: ["40", "50", "20", "40א", "30", "ללא"],
  roles: ["צמ״מ", "מג״ד", "סמג״ד", "מ״פ", "מ״מ", "מ״כ/סמ״ל", "קמב״ץ", "קצין אג״ם", "מטיס / נווט", "אחר"],
  battalions: []
};

// Map of english keys to hebrew labels for the UI
export const LISTS_META = {
  sectors: "גזרות",
  observations: "מזהה תצפיות",
  roles: "תפקיד",
  battalions: "גדוד"
};

let cachedLists = null;

export async function fetchLists() {
  if (cachedLists) return cachedLists;

  // Try to load from localStorage first for immediate display
  const local = localStorage.getItem("8109_lists_cache");
  if (local) {
    try {
      cachedLists = JSON.parse(local);
    } catch(e) {}
  }

  // Fetch from Firestore
  try {
    const ref = doc(db, LISTS_DOC_PATH);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      cachedLists = {
        sectors: data.sectors || DEFAULT_LISTS.sectors,
        observations: data.observations || DEFAULT_LISTS.observations,
        roles: data.roles || DEFAULT_LISTS.roles,
        battalions: data.battalions || DEFAULT_LISTS.battalions
      };
      localStorage.setItem("8109_lists_cache", JSON.stringify(cachedLists));
      return cachedLists;
    } else {
      // Initialize if missing
      await setDoc(ref, DEFAULT_LISTS, { merge: true });
      cachedLists = { ...DEFAULT_LISTS };
      localStorage.setItem("8109_lists_cache", JSON.stringify(cachedLists));
      return cachedLists;
    }
  } catch (err) {
    console.error("Error fetching lists", err);
    // If offline or permission denied, fallback to local cache or defaults
    if (!cachedLists) cachedLists = { ...DEFAULT_LISTS };
    return cachedLists;
  }
}

export async function updateList(listKey, newListArray) {
  try {
    const ref = doc(db, LISTS_DOC_PATH);
    await setDoc(ref, { [listKey]: newListArray }, { merge: true });
    
    // Update local cache
    if (!cachedLists) cachedLists = { ...DEFAULT_LISTS };
    cachedLists[listKey] = newListArray;
    localStorage.setItem("8109_lists_cache", JSON.stringify(cachedLists));
    return true;
  } catch (err) {
    console.error("Error updating list", err);
    throw err;
  }
}

export function populateSelect(selectId, optionsArray, selectedValue = "", baseText = "בחר", extraOption = null) {
  const el = document.getElementById(selectId);
  if (!el) return;

  // Store current selection to restore if possible, or use provided selectedValue
  const currentVal = selectedValue || el.value;
  
  el.innerHTML = ""; // Clear
  
  if (baseText) {
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = baseText;
    el.appendChild(defaultOpt);
  }

  if (extraOption) {
    const extOpt = document.createElement("option");
    extOpt.value = extraOption.value;
    extOpt.textContent = extraOption.text;
    el.appendChild(extOpt);
  }

  // Populate dynamic options
  for (const opt of optionsArray) {
    const option = document.createElement("option");
    option.value = opt;
    option.textContent = opt;
    if (opt === currentVal) option.selected = true;
    el.appendChild(option);
  }
}
