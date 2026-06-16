const mongoose = require("mongoose");

/**
 * =========================================================
 * BANK PRODUCT MODEL
 * =========================================================
 * PURPOSE:
 * Stores mortgage products offered by banks.
 *
 * EXAMPLES:
 * - ENBD Fixed Mortgage
 * - ADCB Islamic Home Finance
 * - FAB Buyout Mortgage
 *
 * EACH PRODUCT BELONGS TO:
 * - one bank
 *
 * USED IN:
 * - proposals
 * - applications
 * - product comparisons
 * - eligibility engine
 * - mortgage calculations
 * =========================================================
 */

const BankProductSchema = new mongoose.Schema(
{
    /**
     * =====================================================
     * PRODUCT IDENTIFICATION
     * =====================================================
     */

    productId: {
        type: mongoose.Schema.Types.Mixed,
        unique: true,
        index: true,
        sparse: true
    },

    productName: {
        type: String,
        required: true,
        trim: true,
        index: true
    },

    description: {
        type: String,
        default: ""
    },

    /**
     * =====================================================
     * BANK REFERENCE
     * =====================================================
     */

    bank: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Bank",
        required: true,
        index: true
    },

    /**
     * =====================================================
     * MORTGAGE TYPE
     * =====================================================
     */

    mortgageType: {
        type: String,
        enum: [
            "Islamic",
            "Conventional"
        ],
        required: true,
        index: true
    },

    /**
     * =====================================================
     * TRANSACTION TYPE
     * =====================================================
     */

    transactionType: [{
        type: String,
        enum: [
            "Primary Residential",
            "Primary - Residential",
            "Primary Commercial",
            "Primary - Commercial",
            "Buyout",
            "Equity",
            "Buyout + Equity",
            "Offplan"
        ]
    }],

    /**
     * =====================================================
     * EMPLOYMENT ELIGIBILITY
     * =====================================================
     */

    employmentStatus: [{
        type: String,
        enum: [
            "Salaried",
            "Self-Employed"
        ]
    }],

    /**
     * =====================================================
     * RESIDENCY ELIGIBILITY
     * =====================================================
     */

    residencyStatus: [{
        type: String,
        enum: [
            "UAE National",
            "UAE Resident",
            "Non-Resident"
        ]
    }],

    /**
     * =====================================================
     * RATE INFORMATION
     * =====================================================
     */

    minimumFloorRate: {
        type: String,
        required: true
    },

    rateType: {
        type: String,
        enum: [
            "Fixed",
            "Variable"
        ],
        required: true
    },

    /**
     * Examples:
     * - 3.99%
     * - EIBOR + 1.99%
     */

    interestRate: {
        type: String,
        required: true
    },

    followOnRate: {
        type: String,
        default: ""
    },

    /**
     * =====================================================
     * LOAN DETAILS & PAYMENTS
     * =====================================================
     */

    ltv: {
        type: String,
        required: true
    },

    monthlyPayment: {
        type: String,
        default: ""
    },

    overPayment: {
        type: String,
        default: ""
    },

    minLoanAmount: {
        type: Number,
        default: 0,
        min: 0
    },

    maxLoanAmount: {
        type: Number,
        default: null,
        min: 0
    },

    minSalary: {
        type: Number,
        default: 0,
        min: 0
    },

    /**
     * =====================================================
     * SALARY TRANSFER
     * =====================================================
     */

    salaryTransfer: {
        type: String,
        enum: [
            "STL",
            "NSTL",
            "Both"
        ],
        default: "Both"
    },

    /**
     * =====================================================
     * FEES
     * =====================================================
     */

    bankFees: {
        type: String,
        default: ""
    },

    propertyValuationFee: {
        type: String,
        default: ""
    },

    bankPreApprovalFee: {
        type: String,
        default: ""
    },

    isBankPreApprovalFeeFree: {
        type: Boolean,
        default: false
    },

    minimumBankProcessingFee: {
        type: String,
        default: ""
    },

    buyoutFee: {
        type: String,
        default: ""
    },

    isBuyoutFeeNA: {
        type: Boolean,
        default: false
    },

    /**
     * =====================================================
     * INSURANCE
     * =====================================================
     */

    propertyInsurance: {
        value: {
            type: String,
            default: ""
        },
        frequency: {
            type: String,
            enum: ["pa", "pm"],
            default: "pa"
        }
    },

    lifeInsurance: {
        value: {
            type: String,
            default: ""
        },
        frequency: {
            type: String,
            enum: ["pa", "pm"],
            default: "pa"
        }
    },

    /**
     * =====================================================
     * PRODUCT VALIDITY
     * =====================================================
     */

    productValidity: {
        doesNotExpire: {
            type: Boolean,
            default: true
        },
        expiryDate: {
            type: Date,
            default: null
        }
    },

    /**
     * =====================================================
     * FEATURES
     * =====================================================
     */

    keyFeatures: [{
        type: String,
        trim: true
    }],

    /**
     * =====================================================
     * DISPLAY
     * =====================================================
     */

    displayOrder: {
        type: Number,
        default: 0
    },

    isFeatured: {
        type: Boolean,
        default: false
    },

    isPopular: {
        type: Boolean,
        default: false
    },

    /**
     * =====================================================
     * STATUS
     * =====================================================
     */

    status: {
        type: String,
        enum: [
            "Active",
            "Inactive",
            "Archived",
            "Expired"
        ],
        default: "Active",
        index: true
    },

    isDeleted: {
        type: Boolean,
        default: false
    },

    deletedAt: {
        type: Date,
        default: null
    },

    /**
     * =====================================================
     * COUNTS
     * =====================================================
     */

    proposalsGeneratedCount: {
        type: Number,
        default: 0
    },

    /**
     * =====================================================
     * AUDIT
     * =====================================================
     */

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
        default: null
    },

    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
        default: null
    }
},
{
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
}
);

/**
 * =========================================================
 * INDEXES
 * =========================================================
 */

BankProductSchema.index({ bank: 1 });
BankProductSchema.index({ productName: 1 });
BankProductSchema.index({ mortgageType: 1 });
BankProductSchema.index({ residencyStatus: 1 });
BankProductSchema.index({ employmentStatus: 1 });
BankProductSchema.index({ status: 1 });
BankProductSchema.index({ isDeleted: 1 });
BankProductSchema.index({ isFeatured: 1 });
BankProductSchema.index({ isPopular: 1 });
BankProductSchema.index({ displayOrder: 1 });
BankProductSchema.index({ ltv: 1 });
BankProductSchema.index({ minLoanAmount: 1 });
BankProductSchema.index({ maxLoanAmount: 1 });
BankProductSchema.index({ productId: 1 }, { sparse: true });

/**
 * =========================================================
 * VIRTUALS
 * =========================================================
 */

BankProductSchema.virtual("isExpired").get(function () {
    if (this.productValidity.doesNotExpire) {
        return false;
    }
    if (!this.productValidity.expiryDate) {
        return false;
    }
    return new Date() > this.productValidity.expiryDate;
});

BankProductSchema.virtual("isActiveProduct").get(function () {
    return this.status === "Active" && !this.isDeleted && !this.isExpired;
});

BankProductSchema.virtual("maxLTV").get(function () {
    if (this.ltv && typeof this.ltv === 'object') {
        return parseFloat(this.ltv.max) || 0;
    }
    return parseFloat(this.ltv) || 0;
});

BankProductSchema.virtual("minLTV").get(function () {
    if (this.ltv && typeof this.ltv === 'object') {
        return parseFloat(this.ltv.min) || 0;
    }
    return parseFloat(this.ltv) || 0;
});

/**
 * =========================================================
 * INSTANCE METHODS
 * =========================================================
 */

BankProductSchema.methods.softDelete = async function () {
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.status = "Archived";
    return this.save();
};

BankProductSchema.methods.restore = async function () {
    this.isDeleted = false;
    this.deletedAt = null;
    this.status = "Active";
    return this.save();
};

BankProductSchema.methods.checkEligibility = function (loanAmount, ltv, employmentType, residencyType) {
    const checks = {
        loanAmount: loanAmount >= this.minLoanAmount && (!this.maxLoanAmount || loanAmount <= this.maxLoanAmount),
        ltv: ltv <= (parseFloat(this.ltv) || 100),
        employment: this.employmentStatus.includes(employmentType),
        residency: this.residencyStatus.includes(residencyType),
        notExpired: !this.isExpired,
        isActive: this.status === "Active"
    };
    
    const isEligible = Object.values(checks).every(check => check === true);
    
    return {
        eligible: isEligible,
        checks: checks,
        failedChecks: Object.entries(checks)
            .filter(([_, passed]) => !passed)
            .map(([check]) => check)
    };
};

/**
 * =========================================================
 * STATIC METHODS
 * =========================================================
 */

/**
 * Get active products with optional filters
 */
BankProductSchema.statics.getActiveProducts = function (filters = {}) {
    const query = {
        status: "Active",
        isDeleted: false,
        ...filters
    };
    
    return this.find(query)
        .populate("bank", "bankName bankCode logo")
        .sort({ displayOrder: 1, createdAt: -1 });
};

/**
 * Get products by bank
 */
BankProductSchema.statics.getProductsByBank = function (bankId) {
    return this.find({
        bank: bankId,
        isDeleted: false,
        status: "Active"
    })
    .populate("bank", "bankName bankCode logo")
    .sort({ displayOrder: 1 });
};

/**
 * Get featured products
 */
BankProductSchema.statics.getFeaturedProducts = function (limit = 10) {
    return this.find({
        isFeatured: true,
        status: "Active",
        isDeleted: false
    })
    .populate("bank", "bankName bankCode logo")
    .sort({ displayOrder: 1 })
    .limit(limit);
};

/**
 * Get products by mortgage type
 */
BankProductSchema.statics.getProductsByMortgageType = function (mortgageType) {
    return this.find({
        mortgageType: mortgageType,
        status: "Active",
        isDeleted: false
    })
    .populate("bank", "bankName bankCode logo")
    .sort({ displayOrder: 1 });
};

/**
 * Search products
 */
BankProductSchema.statics.searchProducts = function (searchTerm) {
    return this.find({
        $or: [
            { productName: { $regex: searchTerm, $options: "i" } },
            { description: { $regex: searchTerm, $options: "i" } },
            { keyFeatures: { $regex: searchTerm, $options: "i" } }
        ],
        status: "Active",
        isDeleted: false
    })
    .populate("bank", "bankName bankCode logo")
    .sort({ displayOrder: 1 });
};

/**
 * =========================================================
 * MIDDLEWARE
 * =========================================================
 */

// Pre-save middleware to generate numeric productId if not provided
BankProductSchema.pre('save', async function(next) {
    if (!this.productId && this.productName && this.bank) {
        try {
            // Find the last product with a numeric ID (ignoring legacy alphanumeric ones)
            const lastProduct = await mongoose.model("BankMortgageProducts").findOne({
                productId: { $not: /[^0-9]/ }
            }, {}, { sort: { productId: -1 } });
            const lastId = lastProduct && lastProduct.productId ? parseInt(lastProduct.productId) : 1000;
            this.productId = lastId + 1;
        } catch (err) {
            console.error("Error generating sequential productId:", err);
            // Fallback
            this.productId = Math.floor(1000 + Math.random() * 9000);
        }
    }
    next();
});

// Pre-find middleware to exclude deleted products by default
BankProductSchema.pre(/^find/, function(next) {
    if (!this.getQuery().hasOwnProperty('isDeleted')) {
        this.where({ isDeleted: false });
    }
    next();
});

// Post-find middleware to filter expired products
BankProductSchema.post('find', function(docs) {
    return docs.filter(doc => !doc.isExpired || doc.productValidity.doesNotExpire);
});

/**
 * =========================================================
 * EXPORT
 * =========================================================
 */

module.exports = mongoose.model("BankMortgageProducts", BankProductSchema);