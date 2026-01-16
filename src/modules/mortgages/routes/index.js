const express = require("express");
const router = express.Router();

const { createMortgageApplication, getLeadData, createBankProducts,getAllBankProducts,getAllUaeStates,UpdateLeadDocuments } = require("../controllers/index.js");

router.post("/create-mortgage-application", createMortgageApplication);
router.get("/get-lead-data", getLeadData);
router.post("/update-lead-documents",UpdateLeadDocuments);
router.post("/create-bank-products", createBankProducts)
router.get("/get-all-bank-products", getAllBankProducts)
router.get("/get-all-uae-states", getAllUaeStates)

module.exports = router;
