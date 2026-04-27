const express = require("express");
const router = express.Router();

const gridAdvisorController = require("../controller/index.js");
const { protect, restrictTo } = require("../../../../middleware/auth");

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES  (no auth needed)
// ════════════════════════════════════════════════════════════════════════════

router.post("/login", gridAdvisorController.loginGridAdvisor);


router.post("/reset-password", gridAdvisorController.resetPassword);





// ════════════════════════════════════════════════════════════════════════════
// PROTECTED ROUTES  (Admin only)
// ════════════════════════════════════════════════════════════════════════════

router
  .route("/")
  .post(protect, gridAdvisorController.createGridAdvisor)
  .get(protect, gridAdvisorController.getAllGridAdvisors);

router
  .route("/:id")
  .get(protect, gridAdvisorController.getGridAdvisorById);

router
  .route("/:id/suspend")
  .put(protect, gridAdvisorController.suspendGridAdvisor);

module.exports = router;
