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
        type: String,
        unique: true,
        trim: true,
        index: true
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
            "Primary Commercial",
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
        type: Number,
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
     * LOAN DETAILS
     * =====================================================
     */

    ltv: {
        min: {
            type: Number,
            default: 0
        },

        max: {
            type: Number,
            required: true
        }
    },

    minLoanAmount: {
        type: Number,
        default: 0
    },

    maxLoanAmount: {
        type: Number,
        default: null
    },

    minSalary: {
        type: Number,
        default: 0
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
        type: Number,
        default: 0
    },

    propertyValuationFee: {
        type: Number,
        default: 0
    },

    bankPreApprovalFee: {
        type: Number,
        default: 0
    },

    isBankPreApprovalFeeFree: {
        type: Boolean,
        default: false
    },

    minimumBankProcessingFee: {
        type: Number,
        default: 0
    },

    buyoutFee: {
        type: Number,
        default: 0
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
            type: Number,
            default: 0
        },

        frequency: {
            type: String,
            enum: [
                "pa",
                "pm"
            ],
            default: "pa"
        }
    },

    lifeInsurance: {
        value: {
            type: Number,
            default: 0
        },

        frequency: {
            type: String,
            enum: [
                "pa",
                "pm"
            ],
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
        type: String
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
    timestamps: true
}
);

/**
 * =========================================================
 * INDEXES
 * =========================================================
 */

BankProductSchema.index({
    bank: 1
});

BankProductSchema.index({
    productName: 1
});

BankProductSchema.index({
    mortgageType: 1
});

BankProductSchema.index({
    residencyStatus: 1
});

BankProductSchema.index({
    employmentStatus: 1
});

BankProductSchema.index({
    status: 1
});

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

/**
 * =========================================================
 * STATIC METHODS
 * =========================================================
 */

/**
 * Get active products
 */

BankProductSchema.statics.getActiveProducts = function () {

    return this.find({
        status: "Active",
        isDeleted: false
    })
    .populate("bank")
    .sort({
        displayOrder: 1
    });
};

/**
 * =========================================================
 * EXPORT
 * =========================================================
 */

module.exports = mongoose.model(
    "BankMortgageProducts",
    BankProductSchema
);