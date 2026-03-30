// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

function assertAuthed(context){
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }
}

async function assertAdmin(uid){
  const ref = admin.firestore().collection("admins").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError("permission-denied", "Not an admin");
  }
}

exports.getStats = functions.https.onCall(async (data, context) => {
  assertAuthed(context);
  await assertAdmin(context.auth.uid);

  const groupBy = (data && data.groupBy) || "type";
  const daysBack = Number((data && data.daysBack) || 30);

  const allowed = new Set(["type","sector","role","name"]);
  if (!allowed.has(groupBy)) {
    throw new functions.https.HttpsError("invalid-argument", "Bad groupBy");
  }

  const since = new Date(Date.now() - daysBack * 24*60*60*1000);

  // NOTE:
  // createdAt הוא serverTimestamp → אפשר לבצע query יעיל רק אחרי שיש ערך.
  const q = admin.firestore()
    .collection("reviews")
    .where("createdAt", ">=", since);

  const snap = await q.get();

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

  return { counts, total: snap.size, groupBy, daysBack };
});
