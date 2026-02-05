
const express = require("express");
const {agencySignup,verifyOTP,getAllAgents,updateAgencyStatus,updateAgent,agentSignup} = require("../controllers/index.js");

const router = express.Router();

//agency signup
router.post("/agency-signup",agencySignup)
router.post("/agency-signup/verify-otp",verifyOTP)
router.post("/update-agency-status",updateAgencyStatus)
router.post("/create-agent",agentSignup)
router.post("/update-agent",updateAgent)
router.get("/get-all-agents",getAllAgents)

module.exports = router;
