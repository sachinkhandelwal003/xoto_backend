const express = require("express");
const router = express.Router();

const gridAdvisorController = require("../controller/index.js");
const GridAdvisor = require("../model/index.js");
const { protect, restrictTo, protectMulti } = require("../../../../middleware/auth");

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES  (no auth needed)
// ════════════════════════════════════════════════════════════════════════════

router.post("/login", gridAdvisorController.loginGridAdvisor);

router.post("/reset-password", gridAdvisorController.resetPassword);

// ════════════════════════════════════════════════════════════════════════════
// PROTECTED ROUTES  (advisor)
// ════════════════════════════════════════════════════════════════════════════
router.get("/me/dashboard", protectMulti, gridAdvisorController.getGridAdvisorDashboard);
router.get("/me/leaderboard", protectMulti, gridAdvisorController.getMyAdvisorLeaderboard);
router.get("/me", protectMulti, async (req, res) => {
  try {
    const advisor = await GridAdvisor.findById(req.user._id)
      .select("-password -loginLink -loginLinkExpiresAt")
      .populate("role", "name code");
    if (!advisor) {
      return res.status(404).json({ status: "fail", message: "Advisor not found" });
    }
    res.status(200).json({ status: "success", data: { advisor } });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});
router.patch("/me", protectMulti, gridAdvisorController.updateMyProfile);
router.post("/me/change-password", protectMulti, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ status: "fail", message: "oldPassword and newPassword are required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ status: "fail", message: "New password must be at least 8 characters" });
    }
    const GridAdvisor = require("../model/index.js");
    const advisor = await GridAdvisor.findById(req.user._id).select("+password");
    if (!advisor) {
      return res.status(404).json({ status: "fail", message: "Advisor not found" });
    }
    const isCorrect = await advisor.correctPassword(oldPassword);
    if (!isCorrect) {
      return res.status(401).json({ status: "fail", message: "Old password is incorrect" });
    }
    advisor.password = newPassword;
    advisor.mustResetPassword = false;
    await advisor.save();
    res.status(200).json({ status: "success", message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// router.get ("/me",           protectMulti, gridAdvisorController.getMyProfile);  // ✅ NEW
router.put("/me",          protectMulti, gridAdvisorController.updateMyProfile);    // ✅ NEW



// ════════════════════════════════════════════════════════════════════════════
// PROTECTED ROUTES  (Admin only)
// ════════════════════════════════════════════════════════════════════════════

router
  .route("/")
  .post(protect, gridAdvisorController.createGridAdvisor)
  .get(protectMulti, gridAdvisorController.getAllGridAdvisors);

// Leaderboard route (MUST COME BEFORE /:id!)
router.get("/leaderboard", protect, gridAdvisorController.getAdvisorLeaderboard);

router
  .route("/:id")
  .get(protect, gridAdvisorController.getGridAdvisorById);

router
  .route("/:id/suspend")
  .put(protect, gridAdvisorController.suspendGridAdvisor);

module.exports = router;
