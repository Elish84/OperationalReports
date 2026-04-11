import admin from "firebase-admin";
admin.initializeApp();
console.log(typeof admin.firestore.FieldValue.vector);
process.exit(0);
