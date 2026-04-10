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
  getBankProductStats
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

module.exports = router;