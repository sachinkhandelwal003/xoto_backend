
const express = require("express");
const {agencySignup} = require("../controllers/index.js");

const router = express.Router();

//agency signup
router.post("/agency-signup",agencySignup)

module.exports = router;
