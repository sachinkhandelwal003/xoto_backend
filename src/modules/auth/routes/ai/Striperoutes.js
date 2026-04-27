const express = require('express');
const router = express.Router();
const {
  createCheckoutSession,
  handleWebhook
} = require('../../controllers/ai/Stripecontroller');

// ✅ Webhook — raw body (app.js se aa rahi hai)
router.post('/webhook', handleWebhook);

// ✅ Checkout session — express.json() HATAO, app.js mein already hai
router.post('/create-checkout-session', createCheckoutSession);

module.exports = router;