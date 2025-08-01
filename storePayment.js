// storePayment.js 🔐 Clean version using Admin SDK with serviceAccountKey.json

const admin = require("firebase-admin");
const path = require("path");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


const adminDb = admin.firestore();

const storePaymentDetails = async (paymentInfo) => {
  try {
    const docRef = await adminDb.collection("payments").add({
      ...paymentInfo,
      createdAt: admin.firestore.FieldValue.serverTimestamp(), // ⏱ accurate Firestore time
    });
    console.log("✅ Stored to Firestore (Admin SDK):", docRef.id);
  } catch (error) {
    console.error("❌ Error saving payment (Admin SDK):", error.message);
  }
};

module.exports = {
  storePaymentDetails,
};
