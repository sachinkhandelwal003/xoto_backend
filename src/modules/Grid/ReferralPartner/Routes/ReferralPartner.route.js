const express = require("express");
const { 
  registerReferralPartner, 
  loginReferralPartner,
  getProfile,
  updateBasicInfo,
  updateIdDocument,
  updateBankDetails,
  getReferralLeaderboard,
  getAllReferralPartners,
  getReferralPartnerById,
  suspendReferralPartner,
  sendOTP,
  verifyOTP,
  registerPartnerUnified,
  createReferralLeadApp,
  getReferralLeadsApp,
  getReferralLeadDetailApp
} = require("../Controllers/ReferralPartner.controller");

const router = express.Router();

const { protectMulti, protect } = require("../../../../middleware/auth");

router.post("/register-partner",          registerReferralPartner);
router.post("/register-partner-unified",  registerPartnerUnified);
router.post("/login-partner",             loginReferralPartner);
router.post("/otp/send",                  sendOTP);
router.post("/otp/verify",                verifyOTP);

// Connect App Unified Lead routes — protected
router.post("/create-lead", protectMulti, createReferralLeadApp);
router.get("/my-leads",     protectMulti, getReferralLeadsApp);
router.get("/leads/:id",    protectMulti, getReferralLeadDetailApp);

// Profile routes — protected (MUST COME BEFORE /:id!)
router.get("/profile",              protectMulti, getProfile);
router.put("/profile/basic",      protectMulti, updateBasicInfo);
router.put("/profile/id-document", protectMulti, updateIdDocument);
router.put("/profile/bank",       protectMulti, updateBankDetails);

// Leaderboard route (MUST COME BEFORE /:id!)
router.get("/leaderboard", protectMulti, getReferralLeaderboard);

// Admin routes
router.get("/", protect, getAllReferralPartners);
router.get("/:id", protect, getReferralPartnerById);
router.put("/:id/suspend", protect, suspendReferralPartner);

module.exports = router;