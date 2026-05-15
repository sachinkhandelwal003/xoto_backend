import Bank from "../models/BankModel.js";

import BankProduct from "../models/BankProduct.js";
/**
 * =========================================
 * CREATE BANK
 * =========================================
 */

exports.createBank = async (req, res) => {

    try {

        const existingBank = await Bank.findOne({
            bankCode: req.body.bankCode
        });

        if (existingBank) {
            return res.status(400).json({
                success: false,
                message: "Bank code already exists"
            });
        }

        const bank = await Bank.create({
            ...req.body,
            createdBy: req.user.id
        });

        return res.status(201).json({
            success: true,
            message: "Bank created successfully",
            data: bank
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }
};

/**
 * =========================================
 * GET ALL BANKS
 * =========================================
 */

exports.getAllBanks = async (req, res) => {

    try {

        const banks = await Bank.find({
            isDeleted: false
        }).sort({
            displayOrder: 1
        });

        return res.status(200).json({
            success: true,
            data: banks
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }
};

/**
 * =========================================
 * GET SINGLE BANK
 * =========================================
 */

exports.getBankById = async (req, res) => {

    try {

        const bank = await Bank.findById(req.params.id);

        if (!bank) {
            return res.status(404).json({
                success: false,
                message: "Bank not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: bank
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }
};

/**
 * =========================================
 * UPDATE BANK
 * =========================================
 */

exports.updateBank = async (req, res) => {

    try {

        const bank = await Bank.findByIdAndUpdate(
            req.params.id,
            {
                ...req.body,
                updatedBy: req.user.id
            },
            {
                new: true,
                runValidators: true
            }
        );

        return res.status(200).json({
            success: true,
            message: "Bank updated successfully",
            data: bank
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }
};

/**
 * =========================================
 * DELETE BANK
 * =========================================
 */

exports.deleteBank = async (req, res) => {

    try {

        await Bank.findByIdAndUpdate(
            req.params.id,
            {
                isDeleted: true,
                deletedAt: new Date(),
                status: "Archived"
            }
        );

        return res.status(200).json({
            success: true,
            message: "Bank deleted successfully"
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }
};






/**
 * =========================================
 * CREATE PRODUCT
 * =========================================
 */

exports.createBankProduct = async (req, res) => {

    try {

        const bankExists = await Bank.findById(req.body.bank);

        if (!bankExists) {

            return res.status(404).json({
                success: false,
                message: "Bank not found"
            });

        }

        const product = await BankProduct.create({
            ...req.body,
            createdBy: req.user.id
        });

        return res.status(201).json({
            success: true,
            message: "Bank product created successfully",
            data: product
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }
};

/**
 * =========================================
 * GET ALL PRODUCTS
 * =========================================
 */

exports.getAllBankProducts = async (req, res) => {

    try {

        let query = {
            isDeleted: false
        };

        if (req.query.bank) {
            query.bank = req.query.bank;
        }

        if (req.query.mortgageType) {
            query.mortgageType = req.query.mortgageType;
        }

        if (req.query.status) {
            query.status = req.query.status;
        }

        const products = await BankProduct.find(query)
            .populate("bank")
            .sort({
                displayOrder: 1
            });

        return res.status(200).json({
            success: true,
            data: products
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }
};

/**
 * =========================================
 * GET PRODUCT BY ID
 * =========================================
 */

exports.getBankProductById = async (req, res) => {

    try {

        const product = await BankProduct.findById(req.params.id)
            .populate("bank");

        if (!product) {

            return res.status(404).json({
                success: false,
                message: "Product not found"
            });

        }

        return res.status(200).json({
            success: true,
            data: product
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }
};

/**
 * =========================================
 * UPDATE PRODUCT
 * =========================================
 */

exports.updateBankProduct = async (req, res) => {

    try {

        const product = await BankProduct.findByIdAndUpdate(
            req.params.id,
            {
                ...req.body,
                updatedBy: req.user.id
            },
            {
                new: true,
                runValidators: true
            }
        );

        return res.status(200).json({
            success: true,
            message: "Product updated successfully",
            data: product
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }
};

/**
 * =========================================
 * DELETE PRODUCT
 * =========================================
 */

exports.deleteBankProduct = async (req, res) => {

    try {

        await BankProduct.findByIdAndUpdate(
            req.params.id,
            {
                isDeleted: true,
                deletedAt: new Date(),
                status: "Archived"
            }
        );

        return res.status(200).json({
            success: true,
            message: "Product deleted successfully"
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }
};