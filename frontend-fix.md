# Frontend URL Fix for Email Testing

## Current Issue:
Your React app is calling:
- https://lalcottage-payment-gateway.onrender.com/create-orderId
- https://lalcottage-payment-gateway.onrender.com/verify-payment

But your email-working server is running locally at:
- http://localhost:8081

## Quick Fix for Testing:

Change these lines in your Payment.tsx:

```javascript
// FROM:
const response = await fetch("https://lalcottage-payment-gateway.onrender.com/create-orderId", {

// TO:
const response = await fetch("http://localhost:8081/create-orderId", {
```

```javascript
// FROM:
const verifyResponse = await fetch("https://lalcottage-payment-gateway.onrender.com/verify-payment", {

// TO:
const verifyResponse = await fetch("http://localhost:8081/verify-payment", {
```

## Alternative: Environment Variable Approach

Create a .env file in your React app with:
```
REACT_APP_API_URL=http://localhost:8081
```

Then use:
```javascript
const API_URL = process.env.REACT_APP_API_URL || "https://lalcottage-payment-gateway.onrender.com";

const response = await fetch(`${API_URL}/create-orderId`, {
```
