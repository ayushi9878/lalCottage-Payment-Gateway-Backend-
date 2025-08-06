// server.js
const express = require("express");
const Razorpay = require("razorpay");
const dotenv = require("dotenv");
const cors = require("cors");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
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

// 📧 SMTP Configuration
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST, // e.g., smtp.gmail.com
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER, // your email
      pass: process.env.SMTP_PASS, // your email password or app password
    },
  });
};

// 📧 Email Templates
const generatePaymentConfirmationEmail = (bookingData, paymentDetails) => {
  const {
    name,
    email,
    roomType,
    fromDate,
    toDate,
    guests,
    totalAmount,
    bookingId,
    numberOfNights
  } = bookingData;

  const { paymentId, orderId } = paymentDetails;

  return {
    from: `"${process.env.BUSINESS_NAME || 'Your Hotel'}" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `Payment Confirmation - Booking #${bookingId}`,
    html: `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Confirmation</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .booking-details { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            .success-icon { font-size: 48px; color: #4CAF50; }
            table { width: 100%; border-collapse: collapse; }
            th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
            th { background-color: #f2f2f2; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="success-icon">✅</div>
                <h1>Payment Confirmed!</h1>
                <p>Thank you for your booking</p>
            </div>
            
            <div class="content">
                <h2>Dear ${name},</h2>
                <p>Your payment has been successfully processed. Here are your booking details:</p>
                
                <div class="booking-details">
                    <h3>Booking Information</h3>
                    <table>
                        <tr><th>Booking ID</th><td>#${bookingId}</td></tr>
                        <tr><th>Room Type</th><td>${roomType}</td></tr>
                        <tr><th>Check-in Date</th><td>${fromDate}</td></tr>
                        <tr><th>Check-out Date</th><td>${toDate}</td></tr>
                        <tr><th>Number of Nights</th><td>${numberOfNights}</td></tr>
                        <tr><th>Guests</th><td>${guests}</td></tr>
                        <tr><th>Total Amount</th><td>₹${totalAmount}</td></tr>
                    </table>
                </div>
                
                <div class="booking-details">
                    <h3>Payment Information</h3>
                    <table>
                        <tr><th>Payment ID</th><td>${paymentId}</td></tr>
                        <tr><th>Order ID</th><td>${orderId}</td></tr>
                        <tr><th>Payment Status</th><td><span style="color: #4CAF50; font-weight: bold;">SUCCESS</span></td></tr>
                        <tr><th>Payment Date</th><td>${new Date().toLocaleDateString('en-IN')}</td></tr>
                    </table>
                </div>
                
                <p><strong>What's Next?</strong></p>
                <ul>
                    <li>You will receive a detailed booking confirmation shortly</li>
                    <li>Please keep this email for your records</li>
                    <li>Contact us if you have any questions</li>
                </ul>
            </div>
            
            <div class="footer">
                <p>Thank you for choosing us!</p>
                <p>If you have any questions, please contact us at ${process.env.BUSINESS_EMAIL || process.env.SMTP_USER}</p>
                <p>Phone: ${process.env.BUSINESS_PHONE || 'Contact us'}</p>
            </div>
        </div>
    </body>
    </html>
    `,
    text: `
Payment Confirmation - Booking #${bookingId}

Dear ${name},

Your payment has been successfully processed!

Booking Details:
- Booking ID: #${bookingId}
- Room Type: ${roomType}
- Check-in: ${fromDate}
- Check-out: ${toDate}
- Nights: ${numberOfNights}
- Guests: ${guests}
- Total Amount: ₹${totalAmount}

Payment Details:
- Payment ID: ${paymentId}
- Order ID: ${orderId}
- Status: SUCCESS
- Date: ${new Date().toLocaleDateString('en-IN')}

Thank you for choosing us!
    `
  };
};

// 📧 Send Email Function
const sendPaymentConfirmationEmail = async (bookingData, paymentDetails) => {
  try {
    if (!bookingData.email) {
      console.log("⚠️ No email provided, skipping email notification");
      return { success: false, message: "No email provided" };
    }

    const transporter = createTransporter();
    const emailOptions = generatePaymentConfirmationEmail(bookingData, paymentDetails);
    
    const info = await transporter.sendMail(emailOptions);
    
    console.log("✅ Payment confirmation email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
    
  } catch (error) {
    console.error("❌ Failed to send payment confirmation email:", error);
    return { success: false, error: error.message };
  }
};

// ✅ 1. Create Order (Fixed to handle complex booking data)
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

// ✅ 2. Verify Payment (Updated with Email Notification)
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

    // 📧 Send payment confirmation email
    const emailResult = await sendPaymentConfirmationEmail(
      plainBookingData, 
      { paymentId: razorpay_payment_id, orderId: razorpay_order_id }
    );

    res.json({ 
      success: true, 
      message: "Payment Verified Successfully",
      bookingId: plainBookingData.bookingId,
      paymentId: razorpay_payment_id,
      emailSent: emailResult.success,
      emailMessage: emailResult.success ? "Confirmation email sent" : "Email sending failed"
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

// ✅ 3. Razorpay Webhook (Updated with Email Notification)
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
        timestamp: new Date().toISOString()
      });

      // 📧 Try to send email if we have booking data in notes
      if (entity.notes && entity.notes.email) {
        const bookingData = {
          name: entity.notes.name || "Customer",
          email: entity.notes.email,
          phone: entity.notes.phone || "",
          roomType: entity.notes.roomType || "Heritage Room",
          fromDate: entity.notes.fromDate || "",
          toDate: entity.notes.toDate || "",
          guests: entity.notes.guests || "1",
          totalAmount: (entity.amount / 100).toString(),
          bookingId: entity.notes.bookingId || entity.id,
          numberOfNights: entity.notes.nights || "1"
        };

        await sendPaymentConfirmationEmail(
          bookingData,
          { paymentId: entity.id, orderId: entity.order_id }
        );
      }

      console.log("✅ Webhook handled: payment.captured");
    }

    return res.status(200).send("Webhook verified and processed");
  } catch (error) {
    console.error("❌ Webhook error:", error.message);
    return res.status(500).send("Internal Server Error");
  }
});

// 📧 Test Email Endpoint (Optional - for testing)
app.post("/test-email", async (req, res) => {
  try {
    const { email, name = "Test User" } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, message: "Email required" });
    }

    const testBookingData = {
      name,
      email,
      roomType: "Heritage Room",
      fromDate: "2025-01-15",
      toDate: "2025-01-17",
      guests: "2",
      totalAmount: "5000",
      bookingId: "TEST123",
      numberOfNights: "2"
    };

    const testPaymentDetails = {
      paymentId: "pay_test123",
      orderId: "order_test123"
    };

    const result = await sendPaymentConfirmationEmail(testBookingData, testPaymentDetails);
    
    res.json({
      success: result.success,
      message: result.success ? "Test email sent successfully" : "Failed to send test email",
      error: result.error
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Endpoint not found" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});