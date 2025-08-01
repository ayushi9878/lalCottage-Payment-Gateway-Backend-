
# LalCottage Backend

This is the backend for the LalCottage booking platform. It handles:

- Creating Razorpay orders
- Verifying payments
- Storing booking/payment info in Firebase Firestore
- Handling Razorpay webhooks

## 🛠 Tech Stack

- Node.js
- Express
- Firebase Admin SDK
- Razorpay API

## 🚀 API Endpoints

### 1. Create Razorpay Order

POST /create-orderId
Body:
{
"amount": 1000,
"bookingData": {
"name": "John Doe",
"roomType": "Deluxe",
"fromDate": "2025-08-05",
"toDate": "2025-08-10",
"email": "john@example.com",
"userId": "abc123"
}
}

### 2. Verify Razorpay Payment

POST /verify-payment

### 3. Razorpay Webhook Handler

POST /webhook

## 🔧 How to Run Locally

1. Clone this repo
2. Run `npm install`
3. Create a `.env` file with the following variables:

PORT=3456
RAZORPAY_KEY_ID=your_key_id
RAZORPAY_KEY_SECRET=your_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
FIREBASE_ADMIN_PRIVATE_KEY="your_private_key"
FIREBASE_ADMIN_CLIENT_EMAIL=your_email
FIREBASE_ADMIN_PROJECT_ID=your_project_id

4. Run the server:
   node server.js
=======
# lalCottage-Payment-Gateway-Backend-
Lal Cottage Payment Gateway Backend Code using Razorpay

