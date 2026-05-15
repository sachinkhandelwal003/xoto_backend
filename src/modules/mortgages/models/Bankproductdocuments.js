const mongoose = require("mongoose");

/**
 * =========================================================
 * DOCUMENT REQUIREMENT MODEL
 * =========================================================
 * PURPOSE:
 * Master checklist configuration system.
 *
 * THIS MODEL DEFINES:
 * - what customer documents are required
 * - which banks require them
 * - which bank products require them
 * - employment-based requirements
 * - residency-based requirements
 *
 * THIS MODEL DOES NOT STORE:
 * - uploaded files
 * - customer documents
 * - signed forms
 *
 * EXAMPLES:
 * - Passport
 * - Emirates ID
 * - Salary Certificate
 * - Bank Statement
 * - Trade License
 *
 * USED FOR:
 * - dynamic checklist generation
 * - application document requirements
 * - validation rules
 *
 * =========================================================
 */

const DocumentRequirementSchema = new mongoose.Schema(
{
    /**
     * =====================================================
     * BASIC INFORMATION
     * =====================================================
     */

    documentName: {
        type: String,
        required: true,
        trim: true,
        index: true
    },

    /**
     * Unique internal key
     *
     * Example:
     * passport
     * emirates_id
     * salary_certificate
     */

    documentKey: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true
    },

    description: {
        type: String,
        default: ""
    },

    /**
     * =====================================================
     * DOCUMENT CATEGORY
     * =====================================================
     */

    category: {
        type: String,
        enum: [
            "Identity",
            "Income",
            "Banking",
            "Business",
            "Property",
            "Tax",
            "Compliance",
            "Insurance",
            "Other"
        ],
        default: "Other"
    },

    /**
     * =====================================================
     * GLOBAL OR BANK SPECIFIC
     * =====================================================
     *
     * true:
     * required across all banks
     *
     * false:
     * only specific banks/products
     */

    isGlobal: {
        type: Boolean,
        default: true,
        index: true
    },

    /**
     * =====================================================
     * BANK SPECIFIC RULES
     * =====================================================
     */

    applicableBanks: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Bank"
    }],

    applicableBankProducts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "BankProduct"
    }],

    /**
     * =====================================================
     * EMPLOYMENT RULES
     * =====================================================
     */

    applicableEmploymentTypes: [{
        type: String,
        enum: [
            "Salaried",
            "Self-Employed",
            "Both"
        ],
        default: "Both"
    }],

    /**
     * =====================================================
     * RESIDENCY RULES
     * =====================================================
     */

    applicableResidencyStatuses: [{
        type: String,
        enum: [
            "UAE National",
            "UAE Resident",
            "Non-Resident",
            "All"
        ],
        default: "All"
    }],

    /**
     * =====================================================
     * MORTGAGE TYPE RULES
     * =====================================================
     */

    applicableMortgageTypes: [{
        type: String,
        enum: [
            "Islamic",
            "Conventional",
            "Both"
        ],
        default: "Both"
    }],

    /**
     * =====================================================
     * TRANSACTION TYPE RULES
     * =====================================================
     */

    applicableTransactionTypes: [{
        type: String,
        enum: [
            "Primary Residential",
            "Primary Commercial",
            "Buyout",
            "Equity",
            "Buyout + Equity",
            "Offplan",
            "All"
        ],
        default: "All"
    }],

    /**
     * =====================================================
     * VALIDATION RULES
     * =====================================================
     */

    isMandatory: {
        type: Boolean,
        default: true
    },

    requiresFrontBack: {
        type: Boolean,
        default: false
    },

    requiresTranslation: {
        type: Boolean,
        default: false
    },

    requiresAttestation: {
        type: Boolean,
        default: false
    },

    allowMultipleFiles: {
        type: Boolean,
        default: false
    },

    maxFilesAllowed: {
        type: Number,
        default: 1
    },

    /**
     * =====================================================
     * FILE VALIDATION
     * =====================================================
     */

    allowedFileTypes: [{
        type: String,
        enum: [
            "pdf",
            "jpg",
            "jpeg",
            "png"
        ]
    }],

    maxFileSizeMB: {
        type: Number,
        default: 20
    },

    /**
     * =====================================================
     * UI / DISPLAY
     * =====================================================
     */

    placeholderText: {
        type: String,
        default: ""
    },

    helperText: {
        type: String,
        default: ""
    },

    sampleDocumentUrl: {
        type: String,
        default: ""
    },

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

DocumentRequirementSchema.index({
    documentKey: 1
});

DocumentRequirementSchema.index({
    isGlobal: 1
});

DocumentRequirementSchema.index({
    applicableBanks: 1
});

DocumentRequirementSchema.index({
    applicableBankProducts: 1
});

DocumentRequirementSchema.index({
    applicableEmploymentTypes: 1
});

DocumentRequirementSchema.index({
    applicableResidencyStatuses: 1
});

/**
 * =========================================================
 * STATIC METHODS
 * =========================================================
 */

/**
 * Get required documents dynamically
 */

DocumentRequirementSchema.statics.getRequiredDocuments =
async function ({
    bankId,
    bankProductId,
    employmentType,
    residencyStatus,
    mortgageType,
    transactionType
}) {

    return this.find({
        status: "Active",
        isDeleted: false,

        $and: [

            /**
             * GLOBAL OR BANK MATCH
             */

            {
                $or: [
                    { isGlobal: true },
                    { applicableBanks: bankId },
                    { applicableBankProducts: bankProductId }
                ]
            },

            /**
             * EMPLOYMENT MATCH
             */

            {
                applicableEmploymentTypes: {
                    $in: [employmentType, "Both"]
                }
            },

            /**
             * RESIDENCY MATCH
             */

            {
                applicableResidencyStatuses: {
                    $in: [residencyStatus, "All"]
                }
            },

            /**
             * MORTGAGE TYPE MATCH
             */

            {
                applicableMortgageTypes: {
                    $in: [mortgageType, "Both"]
                }
            },

            /**
             * TRANSACTION TYPE MATCH
             */

            {
                applicableTransactionTypes: {
                    $in: [transactionType, "All"]
                }
            }
        ]
    })
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
    "BankDocumentRequirement",
    DocumentRequirementSchema
);