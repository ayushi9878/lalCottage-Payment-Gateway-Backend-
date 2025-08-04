// storePayment.js 🔐 Clean version using Admin SDK with serviceAccountKey.json

const admin = require("firebase-admin");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();


const firebaseConfig = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'), // this is important!
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
};

console.log("🔥 Firebase config:", firebaseConfig);

admin.initializeApp({
  credential: admin.credential.cert(firebaseConfig)
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
