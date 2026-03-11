const express = require("express");
const router = express.Router();

const { createMortgageApplication,productRequirements,UpdateMortgageApplicationPersonalDetails, getLeadData, createBankProducts,getAllBankProducts,getAllUaeStates,UpdateLeadDocuments, deleteBankProduct  } = require("../controllers/index.js");

router.post("/create-mortgage-application", createMortgageApplication);
router.post("/fill-basic-details", createMortgageApplication);
router.get("/get-lead-data", getLeadData);
router.post("/update-lead-documents",UpdateLeadDocuments);
router.post("/update-personal-details",UpdateMortgageApplicationPersonalDetails);
router.post("/create-bank-products", createBankProducts)
router.get("/get-all-bank-products", getAllBankProducts)
router.delete("/delete-bank-product/:id", deleteBankProduct);
router.post("/edit-product-requirements", productRequirements)
router.get("/get-all-uae-states", getAllUaeStates)

module.exports = router;
