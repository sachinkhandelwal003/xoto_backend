const express = require("express");

const {
    createBank,
    getAllBanks,
    getBankById,
    updateBank,
    deleteBank,    createBankProduct,
    getAllBankProducts,
    getBankProductById,
    updateBankProduct,
    deleteBankProduct
} = require("../controllers/bankMortgageProduct.controller");

const {
    protect
} = require("../../../middleware/auth");

const router = express.Router();

/**
 * =========================================
 * PUBLIC ROUTES
 * =========================================
 */

router.get("/", getAllBanks);

router.get("/:id", getBankById);

/**
 * =========================================
 * ADMIN ROUTES
 * =========================================
 */

router.post(
    "/create",
    protect,
    createBank
);

router.put(
    "/update/:id",
    protect,
    updateBank
);

router.delete(
    "/delete/:id",
    protect,
    deleteBank
);


/**
 * =========================================
 * PUBLIC ROUTES
 * =========================================
 */

router.get("/bank/product", getAllBankProducts);

router.get("/bank/product/:id", getBankProductById);

/**
 * =========================================
 * ADMIN ROUTES
 * =========================================
 */

router.post(
    "/bank/product/create",
    protect,
    createBankProduct
);

router.put(
    "/bank/product/update/:id",
    protect,
    updateBankProduct
);

router.delete(
    "/bank/product/delete/:id",
    protect,
    deleteBankProduct
);

module.exports = router;