
const express = require("express");
const {agencySignup,verifyOTP,updateAgencyStatus} = require("../controllers/index.js");

const router = express.Router();

//agency signup
router.post("/agency-signup",agencySignup)
router.post("/agency-signup/verify-otp",verifyOTP)
router.post("/update-agency-status",updateAgencyStatus)

module.exports = router;
