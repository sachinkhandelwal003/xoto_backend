const express = require("express");
const {
    // Bank controllers
    createBank,
    getAllBanks,
    getBankById,
    updateBank,
    deleteBank,
    restoreBank,
    
    // Bank Product controllers
    createBankProduct,
    getAllBankProducts,
    getBankProductById,
    updateBankProduct,
    deleteBankProduct,
    restoreBankProduct,
    checkProductEligibility,
    getFeaturedProducts,
    compareProducts,
    getProductsByBankId,
    getBankProductsSummary,
    getEiborRates
} = require("../controllers/bankMortgageProduct.controller");

const { protect } = require("../../../middleware/auth");

const router = express.Router();

/**
 * =========================================
 * IMPORTANT: Order matters!
 * Specific routes MUST come before parameterized routes
 * =========================================
 */

// =========================================
// 1. PRODUCT ROUTES (Specific paths first)
// =========================================

// Public product routes
router.get("/eibor-rates", getEiborRates);
router.get("/products/featured", getFeaturedProducts);
router.get("/products/get-bank-product/:id", getBankProductById);
router.get("/products", getAllBankProducts);
router.get("/products/:id", getBankProductById);
router.post("/products/compare", compareProducts);
router.post("/products/:productId/check-eligibility", checkProductEligibility);

// Admin product routes
router.post("/products", protect, createBankProduct);
router.put("/products/:id", protect, updateBankProduct);
router.delete("/products/:id", protect, deleteBankProduct);
router.post("/products/:id/restore", protect, restoreBankProduct);

// =========================================
// 2. BANK PRODUCTS BY BANK ID ROUTES
// =========================================
router.get("/:bankId/products", getProductsByBankId);
router.get("/banks/:bankId/products/summary", getBankProductsSummary);
router.get("/admin/:bankId/products", protect, getProductsByBankId);

// =========================================
// 3. BANK ROUTES (Parameterized routes LAST)
// =========================================

// Public bank routes
router.get("/", getAllBanks);
router.get("/:id", getBankById);

// Admin bank routes
router.post("/", protect, createBank);
router.put("/:id", protect, updateBank);
router.delete("/:id", protect, deleteBank);
router.post("/:id/restore", protect, restoreBank);

module.exports = router;