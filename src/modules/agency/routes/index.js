
const express = require("express");
const {agencySignup,verifyOTP} = require("../controllers/index.js");

const router = express.Router();

//agency signup
router.post("/agency-signup",agencySignup)
router.post("/agency-signup/verify-otp",verifyOTP)

module.exports = router;
