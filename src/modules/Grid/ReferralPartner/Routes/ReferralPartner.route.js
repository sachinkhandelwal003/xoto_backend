const express = require("express");
const { 
  registerReferralPartner, 
  loginReferralPartner,
  getProfile,
  updateBasicInfo,
  updateIdDocument,
  updateBankDetails,
} = require("../Controllers/ReferralPartner.controller");

const router = express.Router();

const { protectMulti } = require("../../../../middleware/auth");

router.post("/register-partner", registerReferralPartner);
router.post("/login-partner",    loginReferralPartner);

// Profile routes — protected
router.get("/profile",              protectMulti, getProfile);
router.put("/profile/basic",      protectMulti, updateBasicInfo);
router.put("/profile/id-document", protectMulti, updateIdDocument);
router.put("/profile/bank",       protectMulti, updateBankDetails);
module.exports = router;