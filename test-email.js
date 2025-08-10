// Test email functionality
const fetch = require('node:http');

const testEmailData = {
  email: "customer-test@example.com",  // Different email to test TO/FROM
  name: "Test Customer"
};

const options = {
  hostname: 'localhost',
  port: 8081,
  path: '/test-email',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': JSON.stringify(testEmailData).length
  }
};

const req = fetch.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers: ${JSON.stringify(res.headers)}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response:', data);
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.write(JSON.stringify(testEmailData));
req.end();
