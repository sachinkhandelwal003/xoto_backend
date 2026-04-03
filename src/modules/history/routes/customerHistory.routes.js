const express = require("express");

const {
  getCustomerMyHistory,
  getCustomerSummary,
  getCustomerOrderHistory,
  getCustomerAIHistory,
  getCustomerLoginHistory,
  getCustomerHistoryByAdmin,
} = require("../controllers/customerHistory.controller.js");

const { protectCustomer } = require("../../../middleware/auth.js");

const router = express.Router();

// ── Customer — apni history ───────────────────────────────────
router.get("/my",         protectCustomer, getCustomerMyHistory);
router.get("/my/summary", protectCustomer, getCustomerSummary);
router.get("/my/orders",  protectCustomer, getCustomerOrderHistory);
router.get("/my/ai",      protectCustomer, getCustomerAIHistory);
router.get("/my/logins",  protectCustomer, getCustomerLoginHistory);

// ── Admin — kisi bhi customer ki history ─────────────────────
// router.get("/admin/:customerId", protectAdmin, getCustomerHistoryByAdmin);

module.exports = router;