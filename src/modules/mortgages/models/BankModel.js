const mongoose = require("mongoose");

/**
 * =========================================================
 * BANK MODEL
 * =========================================================
 * PURPOSE:
 * Stores master bank/institution information.
 *
 * EXAMPLES:
 * - Emirates NBD
 * - ADCB
 * - FAB
 * - DIB
 *
 * THIS MODEL DOES NOT STORE:
 * - mortgage rates
 * - products
 * - forms
 * - documents
 *
 * Those belong to separate modules.
 * =========================================================
 */

const BankSchema = new mongoose.Schema(
{
    /**
     * =====================================================
     * BASIC INFORMATION
     * =====================================================
     */

    bankName: {
        type: String,
        required: true,
        trim: true,
        unique: true,
        index: true
    },

    bankCode: {
        type: String,
        required: true,
        trim: true,
        unique: true,
        uppercase: true,
        index: true
    },

    /**
     * =====================================================
     * BRANDING
     * =====================================================
     */

    logo: {
        type: String,
        default: ""
    },

    website: {
        type: String,
        default: ""
    },

    /**
     * =====================================================
     * CONTACT DETAILS
     * =====================================================
     */

    contactEmail: {
        type: String,
        lowercase: true,
        trim: true,
        default: ""
    },

    contactPhone: {
        type: String,
        trim: true,
        default: ""
    },

    /**
     * =====================================================
     * SUPPORTED MORTGAGE TYPES
     * =====================================================
     */

    mortgageTypesSupported: [{
        type: String,
        enum: [
            "Islamic",
            "Conventional"
        ]
    }],

    /**
     * =====================================================
     * DISPLAY / SORTING
     * =====================================================
     */

    displayOrder: {
        type: Number,
        default: 0
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
            "Archived"
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

BankSchema.index({ bankName: 1 });
BankSchema.index({ bankCode: 1 });
BankSchema.index({ status: 1 });
BankSchema.index({ isDeleted: 1 });
BankSchema.index({ displayOrder: 1 });

/**
 * =========================================================
 * VIRTUALS
 * =========================================================
 */

BankSchema.virtual("isActive").get(function () {
    return this.status === "Active" && !this.isDeleted;
});

BankSchema.virtual("bankDisplayName").get(function () {
    return `${this.bankName} (${this.bankCode})`;
});

/**
 * =========================================================
 * INSTANCE METHODS
 * =========================================================
 */

BankSchema.methods.softDelete = async function () {
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.status = "Archived";
    return this.save();
};

BankSchema.methods.restore = async function () {
    this.isDeleted = false;
    this.deletedAt = null;
    this.status = "Active";
    return this.save();
};

/**
 * =========================================================
 * STATIC METHODS
 * =========================================================
 */

/**
 * Get all active banks
 */
BankSchema.statics.getActiveBanks = function () {
    return this.find({
        status: "Active",
        isDeleted: false
    })
    .sort({ displayOrder: 1, bankName: 1 })
    .select("-__v");
};

/**
 * Get bank by code with products
 */
BankSchema.statics.getBankWithProducts = function (bankCode) {
    return this.aggregate([
        { $match: { bankCode: bankCode, isDeleted: false, status: "Active" } },
        {
            $lookup: {
                from: "bankmortgageproducts",
                localField: "_id",
                foreignField: "bank",
                as: "products"
            }
        },
        {
            $addFields: {
                products: {
                    $filter: {
                        input: "$products",
                        as: "product",
                        cond: { $eq: ["$$product.isDeleted", false] }
                    }
                }
            }
        }
    ]);
};

/**
 * =========================================================
 * MIDDLEWARE
 * =========================================================
 */

// Pre-save middleware to ensure bankCode is uppercase
BankSchema.pre('save', function(next) {
    if (this.bankCode) {
        this.bankCode = this.bankCode.toUpperCase();
    }
    next();
});

// Pre-find middleware to exclude deleted banks by default
BankSchema.pre(/^find/, function(next) {
    if (!this.getQuery().hasOwnProperty('isDeleted')) {
        this.where({ isDeleted: false });
    }
    next();
});

/**
 * =========================================================
 * EXPORT
 * =========================================================
 */

module.exports = mongoose.model("Bank", BankSchema);