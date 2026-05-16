const Bank = require("../models/BankModel.js");
const BankProduct = require("../models/BankProduct.js");

/**
 * =========================================
 * BANK CONTROLLERS
 * =========================================
 */

exports.createBank = async (req, res) => {
    try {
        // Check if bank with same code or name exists
        const existingBank = await Bank.findOne({
            $or: [
                { bankCode: req.body.bankCode },
                { bankName: req.body.bankName }
            ]
        });

        if (existingBank) {
            return res.status(400).json({
                success: false,
                message: "Bank with same code or name already exists"
            });
        }

        const bank = await Bank.create({
            ...req.body,
            createdBy: req.user?.id || req.user?._id
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
 * GET ALL BANKS (with pagination and filters)
 */
exports.getAllBanks = async (req, res) => {
    try {
        const { 
            status, 
            includeDeleted, 
            search,
            page = 1,
            limit = 10
        } = req.query;
        
        let query = { isDeleted: false };
        
        // Apply status filter
        if (status) {
            query.status = status;
        }
        
        // Apply search filter
        if (search) {
            query.$or = [
                { bankName: { $regex: search, $options: 'i' } },
                { bankCode: { $regex: search, $options: 'i' } },
                { contactEmail: { $regex: search, $options: 'i' } }
            ];
        }
        
        // Include deleted if requested
        if (includeDeleted === 'true') {
            delete query.isDeleted;
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [banks, total] = await Promise.all([
            Bank.find(query)
                .sort({ displayOrder: 1, bankName: 1 })
                .skip(skip)
                .limit(parseInt(limit))
                .select("-__v"),
            Bank.countDocuments(query)
        ]);

        return res.status(200).json({
            success: true,
            data: banks,
            total: total,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit)),
                totalItems: total
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * GET SINGLE BANK
 */
exports.getBankById = async (req, res) => {
    try {
        const bank = await Bank.findById(req.params.id)
            .select("-__v");

        if (!bank || bank.isDeleted) {
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
 * UPDATE BANK
 */
exports.updateBank = async (req, res) => {
    try {
        const bank = await Bank.findById(req.params.id);

        if (!bank || bank.isDeleted) {
            return res.status(404).json({
                success: false,
                message: "Bank not found"
            });
        }

        // Check for duplicate bank code if being updated
        if (req.body.bankCode && req.body.bankCode !== bank.bankCode) {
            const existingBank = await Bank.findOne({ 
                bankCode: req.body.bankCode,
                isDeleted: false 
            });
            if (existingBank) {
                return res.status(400).json({
                    success: false,
                    message: "Bank code already exists"
                });
            }
        }

        // Check for duplicate bank name if being updated
        if (req.body.bankName && req.body.bankName !== bank.bankName) {
            const existingBank = await Bank.findOne({ 
                bankName: req.body.bankName,
                isDeleted: false 
            });
            if (existingBank) {
                return res.status(400).json({
                    success: false,
                    message: "Bank name already exists"
                });
            }
        }

        const updatedBank = await Bank.findByIdAndUpdate(
            req.params.id,
            {
                ...req.body,
                updatedBy: req.user?.id || req.user?._id
            },
            {
                new: true,
                runValidators: true
            }
        ).select("-__v");

        return res.status(200).json({
            success: true,
            message: "Bank updated successfully",
            data: updatedBank
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * DELETE BANK (Soft Delete)
 */
exports.deleteBank = async (req, res) => {
    try {
        const bank = await Bank.findById(req.params.id);

        if (!bank || bank.isDeleted) {
            return res.status(404).json({
                success: false,
                message: "Bank not found"
            });
        }

        // Check if bank has any active products
        const hasProducts = await BankProduct.findOne({
            bank: bank._id,
            isDeleted: false,
            status: "Active"
        });

        if (hasProducts) {
            return res.status(400).json({
                success: false,
                message: "Cannot delete bank with active products. Archive products first."
            });
        }

        await bank.softDelete();

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
 * RESTORE BANK
 */
exports.restoreBank = async (req, res) => {
    try {
        const bank = await Bank.findById(req.params.id);

        if (!bank) {
            return res.status(404).json({
                success: false,
                message: "Bank not found"
            });
        }

        await bank.restore();

        return res.status(200).json({
            success: true,
            message: "Bank restored successfully",
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
 * BANK PRODUCT CONTROLLERS
 * =========================================
 */

/**
 * CREATE BANK PRODUCT
 */
exports.createBankProduct = async (req, res) => {
    try {
        const bankExists = await Bank.findById(req.body.bank);

        if (!bankExists || bankExists.isDeleted) {
            return res.status(404).json({
                success: false,
                message: "Bank not found"
            });
        }

        // Validate LTV
        if (req.body.ltv && req.body.ltv.max > 100) {
            return res.status(400).json({
                success: false,
                message: "LTV max cannot exceed 100%"
            });
        }

        const product = await BankProduct.create({
            ...req.body,
            createdBy: req.user.id
        });

        const populatedProduct = await BankProduct.findById(product._id)
            .populate("bank", "bankName bankCode logo");

        return res.status(201).json({
            success: true,
            message: "Bank product created successfully",
            data: populatedProduct
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * GET ALL BANK PRODUCTS
 */
exports.getAllBankProducts = async (req, res) => {
    try {
        const {
            bank,
            mortgageType,
            status,
            minLoanAmount,
            maxLoanAmount,
            minLTV,
            isFeatured,
            isPopular,
            search,
            limit = 50,
            page = 1
        } = req.query;

        let query = {
            isDeleted: false
        };

        // Apply filters
        if (bank) query.bank = bank;
        if (mortgageType) query.mortgageType = mortgageType;
        if (status) query.status = status;
        if (isFeatured === 'true') query.isFeatured = true;
        if (isPopular === 'true') query.isPopular = true;
        
        // Loan amount range filter
        if (minLoanAmount || maxLoanAmount) {
            query.$or = [];
            if (minLoanAmount) {
                query.$or.push({ minLoanAmount: { $lte: parseInt(minLoanAmount) } });
            }
            if (maxLoanAmount) {
                query.$or.push({ 
                    $or: [
                        { maxLoanAmount: { $gte: parseInt(maxLoanAmount) } },
                        { maxLoanAmount: null }
                    ]
                });
            }
        }
        
        // LTV filter
        if (minLTV) {
            query["ltv.max"] = { $gte: parseInt(minLTV) };
        }
        
        // Search filter
        if (search) {
            query.$or = [
                { productName: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
                { keyFeatures: { $regex: search, $options: "i" } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [products, total] = await Promise.all([
            BankProduct.find(query)
                .populate("bank", "bankName bankCode logo website")
                .sort({ displayOrder: 1, createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            BankProduct.countDocuments(query)
        ]);

        return res.status(200).json({
            success: true,
            count: products.length,
            total,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            },
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
 * GET BANK PRODUCT BY ID
 */
exports.getBankProductById = async (req, res) => {
    try {
        const product = await BankProduct.findById(req.params.id)
            .populate("bank", "bankName bankCode logo website contactEmail contactPhone")
            .lean();

        if (!product || product.isDeleted) {
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
 * UPDATE BANK PRODUCT
 */
exports.updateBankProduct = async (req, res) => {
    try {
        const product = await BankProduct.findById(req.params.id);

        if (!product || product.isDeleted) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Validate LTV if being updated
        if (req.body.ltv && req.body.ltv.max > 100) {
            return res.status(400).json({
                success: false,
                message: "LTV max cannot exceed 100%"
            });
        }

        const updatedProduct = await BankProduct.findByIdAndUpdate(
            req.params.id,
            {
                ...req.body,
                updatedBy: req.user.id
            },
            {
                new: true,
                runValidators: true
            }
        ).populate("bank", "bankName bankCode logo");

        return res.status(200).json({
            success: true,
            message: "Product updated successfully",
            data: updatedProduct
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * DELETE BANK PRODUCT (Soft Delete)
 */
exports.deleteBankProduct = async (req, res) => {
    try {
        const product = await BankProduct.findById(req.params.id);

        if (!product || product.isDeleted) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        await product.softDelete();

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

/**
 * RESTORE BANK PRODUCT
 */
exports.restoreBankProduct = async (req, res) => {
    try {
        const product = await BankProduct.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        await product.restore();

        return res.status(200).json({
            success: true,
            message: "Product restored successfully",
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
 * CHECK PRODUCT ELIGIBILITY
 */
exports.checkProductEligibility = async (req, res) => {
    try {
        const { productId } = req.params;
        const { loanAmount, ltv, employmentType, residencyType } = req.body;

        const product = await BankProduct.findById(productId)
            .populate("bank", "bankName bankCode");

        if (!product || product.isDeleted) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        const eligibility = product.checkEligibility(
            loanAmount,
            ltv,
            employmentType,
            residencyType
        );

        return res.status(200).json({
            success: true,
            data: {
                productId: product._id,
                productName: product.productName,
                bank: product.bank,
                eligible: eligibility.eligible,
                checks: eligibility.checks,
                failedChecks: eligibility.failedChecks
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * GET FEATURED PRODUCTS
 */
exports.getFeaturedProducts = async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        
        const products = await BankProduct.getFeaturedProducts(parseInt(limit));

        return res.status(200).json({
            success: true,
            count: products.length,
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
 * COMPARE PRODUCTS
 */
exports.compareProducts = async (req, res) => {
    try {
        const { productIds } = req.body;

        if (!productIds || !Array.isArray(productIds) || productIds.length < 2) {
            return res.status(400).json({
                success: false,
                message: "Please provide at least 2 product IDs to compare"
            });
        }

        const products = await BankProduct.find({
            _id: { $in: productIds },
            isDeleted: false
        }).populate("bank", "bankName bankCode logo");

        if (products.length !== productIds.length) {
            return res.status(404).json({
                success: false,
                message: "One or more products not found"
            });
        }

        // Prepare comparison data
        const comparisonData = products.map(product => ({
            id: product._id,
            productName: product.productName,
            bankName: product.bank.bankName,
            logo: product.bank.logo,
            mortgageType: product.mortgageType,
            interestRate: product.interestRate,
            rateType: product.rateType,
            minFloorRate: product.minimumFloorRate,
            maxLTV: product.ltv.max,
            minLoanAmount: product.minLoanAmount,
            maxLoanAmount: product.maxLoanAmount,
            minSalary: product.minSalary,
            bankFees: product.bankFees,
            propertyValuationFee: product.propertyValuationFee,
            keyFeatures: product.keyFeatures,
            isPopular: product.isPopular,
            isFeatured: product.isFeatured
        }));

        return res.status(200).json({
            success: true,
            data: comparisonData
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


/**
 * GET PRODUCTS BY BANK ID
 * Get all products for a specific bank with pagination and filters
 */
exports.getProductsByBankId = async (req, res) => {
    try {
        const { bankId } = req.params;
        const {
            status,
            mortgageType,
            isFeatured,
            isPopular,
            minLoanAmount,
            maxLoanAmount,
            page = 1,
            limit = 10
        } = req.query;

        // Check if bank exists
        const bank = await Bank.findById(bankId);
        if (!bank || bank.isDeleted) {
            return res.status(404).json({
                success: false,
                message: "Bank not found"
            });
        }

        let query = {
            bank: bankId,
            isDeleted: false
        };

        // Apply filters
        if (status) query.status = status;
        if (mortgageType) query.mortgageType = mortgageType;
        if (isFeatured === 'true') query.isFeatured = true;
        if (isPopular === 'true') query.isPopular = true;
        
        // Loan amount filter
        if (minLoanAmount || maxLoanAmount) {
            query.$and = [];
            if (minLoanAmount) {
                query.$and.push({ maxLoanAmount: { $gte: parseInt(minLoanAmount) } });
            }
            if (maxLoanAmount) {
                query.$and.push({ minLoanAmount: { $lte: parseInt(maxLoanAmount) } });
            }
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [products, total] = await Promise.all([
            BankProduct.find(query)
                .populate("bank", "bankName bankCode logo website")
                .sort({ displayOrder: 1, isFeatured: -1, createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            BankProduct.countDocuments(query)
        ]);

        // Add eligibility info to each product
        const productsWithInfo = products.map(product => ({
            ...product,
            isActive: product.status === 'Active' && !product.isExpired,
            minRate: product.minimumFloorRate,
            maxLTV: product.ltv?.max
        }));

        return res.status(200).json({
            success: true,
            data: productsWithInfo,
            bank: {
                _id: bank._id,
                bankName: bank.bankName,
                bankCode: bank.bankCode,
                logo: bank.logo
            },
            total: total,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit)),
                totalItems: total
            },
            filters: {
                status: status || null,
                mortgageType: mortgageType || null,
                isFeatured: isFeatured || null,
                isPopular: isPopular || null
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * GET BANK PRODUCTS SUMMARY (Counts by status)
 */
exports.getBankProductsSummary = async (req, res) => {
    try {
        const { bankId } = req.params;

        // Check if bank exists
        const bank = await Bank.findById(bankId);
        if (!bank || bank.isDeleted) {
            return res.status(404).json({
                success: false,
                message: "Bank not found"
            });
        }

        const summary = await BankProduct.aggregate([
            {
                $match: {
                    bank: bank._id,
                    isDeleted: false
                }
            },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                }
            }
        ]);

        const totalProducts = await BankProduct.countDocuments({
            bank: bankId,
            isDeleted: false
        });

        const activeProducts = await BankProduct.countDocuments({
            bank: bankId,
            isDeleted: false,
            status: "Active"
        });

        const featuredProducts = await BankProduct.countDocuments({
            bank: bankId,
            isDeleted: false,
            isFeatured: true
        });

        const popularProducts = await BankProduct.countDocuments({
            bank: bankId,
            isDeleted: false,
            isPopular: true
        });

        return res.status(200).json({
            success: true,
            data: {
                total: totalProducts,
                active: activeProducts,
                featured: featuredProducts,
                popular: popularProducts,
                byStatus: summary
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};