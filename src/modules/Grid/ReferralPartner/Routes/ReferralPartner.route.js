const express = require("express");
const { 
  registerReferralPartner, 
  loginReferralPartner,
  getProfile,
  updateBasicInfo,
  updateIdDocument,
  updateBankDetails,
  getDashboard,
  changePassword,
  getLeaderboard,
} = require("../Controllers/ReferralPartner.controller");

const router = express.Router();

const { protectMulti } = require("../../../../middleware/auth");

router.post("/register-partner", registerReferralPartner);
router.post("/login-partner",    loginReferralPartner);
router.get("/dashboard", protectMulti, getDashboard);
// Profile routes — protected
router.get("/profile",              protectMulti, getProfile);
router.put("/profile/basic",      protectMulti, updateBasicInfo);
router.put("/profile/id-document", protectMulti, updateIdDocument);
router.put("/profile/bank",       protectMulti, updateBankDetails);
router.put("/profile/password", protectMulti, changePassword);
router.get("/leaderboard", protectMulti, getLeaderboard);
module.exports = router;