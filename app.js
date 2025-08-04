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

// server.js - Updated endpoints to handle complex booking data

// ✅ 1. Create Order (Fixed)
app.post("/create-orderId", async (req, res) => {
  try {
    const { amount, currency = "INR", bookingData } = req.body;
    
    if (!amount) {
      return res.status(400).json({ status: false, message: "Amount required" });
    }

    // ✅ Create safe notes object for Razorpay (max 15 key-value pairs, strings only)
    const safeNotes = {};
    
    if (bookingData) {
      // Extract only essential fields and convert to strings
      const essentialFields = {
        name: bookingData.name || `${bookingData.firstName || ''} ${bookingData.lastName || ''}`.trim(),
        email: bookingData.email,
        phone: bookingData.phone,
        bookingId: bookingData.bookingId,
        userId: bookingData.userId || bookingData.firestoreId,
        roomType: bookingData.roomType || 'Heritage Room',
        fromDate: bookingData.fromDate || bookingData.checkIn,
        toDate: bookingData.toDate || bookingData.checkOut,
        guests: bookingData.guests || bookingData.adults || '1',
        nights: bookingData.nights || bookingData.numberOfNights || '1',
        totalAmount: bookingData.totalAmount || bookingData.totalCalculated || '0'
      };

      // Add only non-empty fields and limit to 15 fields
      let fieldCount = 0;
      for (const [key, value] of Object.entries(essentialFields)) {
        if (value && fieldCount < 15) {
          // Ensure value is string and not too long
          const stringValue = String(value).substring(0, 50);
          if (stringValue.trim()) {
            safeNotes[key] = stringValue;
            fieldCount++;
          }
        }
      }
    }

    console.log("📋 Creating order with safe notes:", safeNotes);

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency,
      receipt: `receipt_${Date.now()}`,
      notes: safeNotes,
    });

    res.json({
      success: true,
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });

  } catch (err) {
    console.error("❌ Create order error:", err);
    console.error("📝 Request body:", JSON.stringify(req.body, null, 2));
    
    res.status(500).json({ 
      success: false, 
      message: "Failed to create order: " + err.message,
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// ✅ 2. Verify Payment (Updated to handle complex booking data)
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

    // ✅ Enhanced data processing to handle both simple and complex formats
    const safeToString = (value) => {
      if (value === null || value === undefined) return "";
      if (typeof value === 'string') return value;
      if (typeof value === 'number') return value.toString();
      if (typeof value === 'boolean') return value.toString();
      if (typeof value === 'object') {
        try {
          return JSON.stringify(value);
        } catch {
          return "[Complex Object]";
        }
      }
      return String(value);
    };

    // Handle both data formats gracefully
    const getName = () => {
      if (bookingData?.name) return safeToString(bookingData.name);
      if (bookingData?.firstName || bookingData?.lastName) {
        const firstName = safeToString(bookingData.firstName || "");
        const lastName = safeToString(bookingData.lastName || "");
        return `${firstName} ${lastName}`.trim();
      }
      return "";
    };

    const getFromDate = () => {
      return safeToString(bookingData?.fromDate || bookingData?.checkIn || "");
    };

    const getToDate = () => {
      return safeToString(bookingData?.toDate || bookingData?.checkOut || "");
    };

    const getUserId = () => {
      return safeToString(bookingData?.userId || bookingData?.firestoreId || bookingData?.bookingId || "");
    };

    const getGuests = () => {
      if (bookingData?.guests) return safeToString(bookingData.guests);
      const adults = parseInt(bookingData?.adults || "0") || 0;
      const children = parseInt(bookingData?.children || "0") || 0;
      const infants = parseInt(bookingData?.infants || "0") || 0;
      return (adults + children + infants).toString();
    };

    // Create flattened, safe booking data for storage
    const plainBookingData = {
      // Basic info
      name: getName(),
      email: safeToString(bookingData?.email || ""),
      phone: safeToString(bookingData?.phone || ""),
      
      // Room and dates
      roomType: safeToString(bookingData?.roomType || "Heritage Room"),
      fromDate: getFromDate(),
      toDate: getToDate(),
      
      // Guest details
      guests: getGuests(),
      adults: safeToString(bookingData?.adults || "1"),
      children: safeToString(bookingData?.children || "0"),
      infants: safeToString(bookingData?.infants || "0"),
      
      // Booking details
      bookingId: safeToString(bookingData?.bookingId || ""),
      userId: getUserId(),
      
      // Pricing
      roomPrice: safeToString(bookingData?.roomPrice || "0"),
      roomSubtotal: safeToString(bookingData?.roomSubtotal || bookingData?.roomTotal || "0"),
      menuTotal: safeToString(bookingData?.menuTotal || "0"),
      totalAmount: safeToString(bookingData?.totalAmount || bookingData?.totalCalculated || "0"),
      numberOfNights: safeToString(bookingData?.numberOfNights || bookingData?.nights || "1"),
      
      // Additional info (safely handle complex data)
      selectedItemsCount: bookingData?.selectedItems ? 
        (Array.isArray(bookingData.selectedItems) ? bookingData.selectedItems.length.toString() : "0") : "0",
      
      // Store complex data as JSON strings if needed for reference
      rawSelectedItems: bookingData?.selectedItems ? 
        safeToString(bookingData.selectedItems) : "[]",
      
      // Metadata
      dataFormat: bookingData?.name ? "simple" : "complex",
      processedAt: new Date().toISOString(),
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id
    };

    console.log("📋 Processed booking data:", plainBookingData);
    console.log("🔍 Original booking data keys:", Object.keys(bookingData || {}));

    const payload = {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      verified: true,
      bookingData: plainBookingData,
      source: "verify-payment",
      timestamp: new Date().toISOString()
    };

    // Store payment details
    await storePaymentDetails(payload);

    res.json({ 
      success: true, 
      message: "Payment Verified Successfully",
      bookingId: plainBookingData.bookingId,
      paymentId: razorpay_payment_id
    });
    
  } catch (err) {
    console.error("❌ Payment verification error:", err);
    console.error("📝 Request body structure:", {
      hasRazorpayOrderId: !!req.body?.razorpay_order_id,
      hasRazorpayPaymentId: !!req.body?.razorpay_payment_id,
      hasRazorpaySignature: !!req.body?.razorpay_signature,
      hasBookingData: !!req.body?.bookingData,
      bookingDataKeys: req.body?.bookingData ? Object.keys(req.body.bookingData) : []
    });
    
    res.status(500).json({ 
      success: false, 
      message: "Payment verification failed: " + err.message,
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// ✅ 3. Razorpay Webhook (Keep existing code)
app.post("/webhook", async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers["x-razorpay-signature"];
  const body = req.body.toString();

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
        timestamp: new Date().toISOString()
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
