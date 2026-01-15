const express = require("express");
const router = express.Router();

const { createMortgageApplication,getLeadData } = require("../controllers/index.js");

router.post("/create-mortgage-application", createMortgageApplication);
router.get("/get-lead-data", getLeadData);

module.exports = router;
