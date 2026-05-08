const express = require("express");
const {
  createBankProducts,
  createBulkBankProducts,
  getAllBankProducts,
  getBankProductById,
  getBestRates,
  getPopularProducts,
  getFeaturedProducts,
  getEligibleProducts,
  getProductsByBank,
  updateBankProduct,
  updateBankProductRate,
  deleteBankProduct,
  hardDeleteBankProduct,
  getBankProductStats,  createBankForm,
  getAllBankForms,
  getFormsByBankProduct,
  recordFormDownload,
  updateBankForm,
  archiveBankForm,createBulkBankForms
} = require("../controllers/bankMortgageProduct.controller");
const { protect } = require("../../../middleware/auth");

const router = express.Router();

// ==================== PUBLIC ROUTES ====================
router.get("/get-all-bank-products", getAllBankProducts);
router.get("/get-bank-product/:id", getBankProductById);
router.get("/best-rates", getBestRates);
router.get("/popular", getPopularProducts);
router.get("/featured", getFeaturedProducts);
router.get("/eligible", getEligibleProducts);
router.get("/by-bank/:bankCode", getProductsByBank);
router.get("/stats", getBankProductStats);

// ==================== ADMIN ONLY ROUTES ====================
router.post("/create-bank-products", protect, createBankProducts);
router.post("/create-bulk", protect, createBulkBankProducts);
router.put("/update-bank-product/:id", protect, updateBankProduct);
router.patch("/update-rate/:id", protect, updateBankProductRate);
router.delete("/delete-bank-product/:id", protect, deleteBankProduct);
router.delete("/hard-delete/:id", protect, hardDeleteBankProduct);

// bank products forms

// Admin only routes
router.post("/create-bank-form", createBankForm);
router.post("/create-bulk-bank-forms", protect, createBulkBankForms);
router.put("/update-bank-form/:formId", protect, updateBankForm);
router.delete("/archive-bank-form/:formId", protect, archiveBankForm);

// Protected routes (all authenticated users)
router.get("/bank-forms", getAllBankForms);
router.get("/bank-forms/bank-product/:bankProductId", protect, getFormsByBankProduct);
router.post("/bank-forms/:formId/download", protect, recordFormDownload);
module.exports = router;