const express = require("express");
const router = express.Router();

const advisorController = require("../controller/index.js");
const { protect, restrictTo } = require("../../../../middleware/auth");

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES  (no auth needed)
// ════════════════════════════════════════════════════════════════════════════

// POST /api/v1/grid/advisor/login
router.post("/login", advisorController.loginAdvisor);
  
// POST /api/v1/grid/advisor/reset-password
router.post("/reset-password", advisorController.resetPassword);

// ════════════════════════════════════════════════════════════════════════════
// PROTECTED ROUTES  (Admin only)
// ════════════════════════════════════════════════════════════════════════════

// POST /api/v1/grid/advisor  — Create new advisor (Admin only)
router.post("/", protect, advisorController.createAdvisor);

module.exports = router;