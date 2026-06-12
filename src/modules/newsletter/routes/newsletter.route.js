const express = require("express");
const router = express.Router();
const {
  subscribe,
  unsubscribe,
  getAllSubscribers,
  sendIndividualEmail,
  sendBulkEmail,
} = require("../controller/newsletter.controller");

// Public endpoints
router.post("/subscribe", subscribe);
router.post("/unsubscribe", unsubscribe);

// Admin endpoints
router.get("/all", getAllSubscribers);
router.post("/send-individual-email", sendIndividualEmail);
router.post("/send-bulk-email", sendBulkEmail);

module.exports = router;
