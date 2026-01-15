const express = require("express");
const router = express.Router();

const { createMortgageApplication } = require("../controllers/index.js");

router.post("/create-mortgage-application", createMortgageApplication);

module.exports = router;
