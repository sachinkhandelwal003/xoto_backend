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

BankSchema.index({
    bankName: 1
});

BankSchema.index({
    bankCode: 1
});

BankSchema.index({
    status: 1
});

/**
 * =========================================================
 * VIRTUALS
 * =========================================================
 */

BankSchema.virtual("isActive").get(function () {
    return this.status === "Active";
});

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
    }).sort({
        displayOrder: 1,
        bankName: 1
    });
};

/**
 * =========================================================
 * EXPORT
 * =========================================================
 */

module.exports = mongoose.model(
    "Bank",
    BankSchema
);