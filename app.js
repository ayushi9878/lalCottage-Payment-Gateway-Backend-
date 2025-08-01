// server.js
const express = require("express");
const Razorpay = require("razorpay");
const dotenv = require("dotenv");
const cors = require("cors");
const crypto = require("crypto");
const { storePaymentDetails } = require("./storePayment");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8081;

// 🟡 Apply raw parser ONLY for webhook route
app.use(
  "/webhook",
  express.raw({ type: "application/json" })
);

// 🟢 Apply JSON body parser for all other routes
app.use(cors());
app.use(express.json());

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ✅ 1. Create Order
app.post("/create-orderId", async (req, res) => {
  try {
    const { amount, currency = "INR", bookingData } = req.body;
    if (!amount)
      return res.status(400).json({ status: false, message: "Amount required" });

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency,
      receipt: `receipt_${Date.now()}`,
      notes: bookingData || {},
    });

    res.json({
      success: true,
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ 2. Verify Payment (Client-side success route)
app.post("/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bookingData
    } = req.body;

    if (!razorpay_order_id || !razorpay_signature || !razorpay_payment_id) {
      return res.status(400).json({
        success: false,
        message: "Missing required Razorpay payment details"
      });
    }

    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid Signature" });
    }

    // ✅ Flatten and validate booking data
    const plainBookingData = {
      name: bookingData?.name?.toString?.() || "",
      roomType: bookingData?.roomType?.toString?.() || "",
      fromDate: bookingData?.fromDate?.toString?.() || "",
      toDate: bookingData?.toDate?.toString?.() || "",
      email: bookingData?.email?.toString?.() || "",
      userId: bookingData?.userId?.toString?.() || ""
    };

    const payload = {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      verified: true,
      bookingData: plainBookingData,
      source: "verify-payment",
    };

    await storePaymentDetails(payload);

    res.json({ success: true, message: "Payment Verified" });
  } catch (err) {
    console.error("Firestore Save Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ 3. Razorpay Webhook
app.post("/webhook", async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers["x-razorpay-signature"];
  const body = req.body.toString(); // because raw

  try {
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.warn("❌ Webhook signature mismatch.");
      return res.status(400).send("Invalid Webhook Signature");
    }

    const payload = JSON.parse(body);
    const event = payload.event;
    const entity = payload.payload?.payment?.entity;

    if (event === "payment.captured" && entity) {
      await storePaymentDetails({
        razorpayData: entity,
        event,
        source: "webhook",
      });
      console.log("✅ Webhook handled: payment.captured");
    }

    return res.status(200).send("Webhook verified and processed");
  } catch (error) {
    console.error("❌ Webhook error:", error.message);
    return res.status(500).send("Internal Server Error");
  }
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Endpoint not found" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
