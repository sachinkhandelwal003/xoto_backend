const express = require("express");
const { 
  registerReferralPartner, 
  loginReferralPartner 
} = require("../Controllers/ReferralPartner.controller");

const router = express.Router();

// ════════════════════════════════════════════════════════════════════════════
// REFERRAL PARTNER ROUTES
// ════════════════════════════════════════════════════════════════════════════

router.post("/register-partner", registerReferralPartner);
router.post("/login-partner", loginReferralPartner);

module.exports = router;