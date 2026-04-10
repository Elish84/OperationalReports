// public/js/firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-functions.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app);

// Explicit Auth Persistence
setPersistence(auth, browserLocalPersistence)
  .catch((err) => console.error("Auth persistence error:", err));

// Firestore Offline Persistence
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn("Firestore: Multiple tabs open, persistence can only be enabled in one tab at a time.");
    } else if (err.code == 'unimplemented') {
        console.warn("Firestore: The current browser does not support all of the features required to enable persistence.");
    }
});
