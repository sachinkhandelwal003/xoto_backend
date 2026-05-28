const mongoose = require("mongoose");

/**
 * =========================================================
 * DOCUMENT REQUIREMENT MODEL (COMPLETE)
 * =========================================================
 * PURPOSE:
 * Three types of documents:
 * 
 * 1. DIRECT_UPLOAD - Customer uploads directly (Passport, Emirates ID)
 * 2. TEMPLATE_DOWNLOAD - Download form, fill, upload back (Bank forms)
 * 3. SAMPLE_VIEW - Just view sample document, no upload (Info only)
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
            "Bank Form",
            "Information",
            "Other"
        ],
        default: "Other",
        index: true
    },

    /**
     * =====================================================
     * DOCUMENT TYPE (3 Types)
     * =====================================================
     * direct_upload: User uploads directly (Passport, EID, Bank Statement)
     * template_download: Download template → Fill → Upload back
     * sample_view: Just view sample document, no upload needed
     */
    documentType: {
        type: String,
        enum: ["direct_upload", "template_download", "sample_view"],
        default: "direct_upload"
    },

    /**
     * =====================================================
     * TEMPLATE INFORMATION (For template_download type)
     * User downloads this template, fills it, then uploads back
     * =====================================================
     */
    template: {
        fileUrl: { type: String, default: null },           // URL to download template
        fileName: { type: String, default: null },          // Original file name
        fileSize: { type: Number, default: 0 },             // File size in bytes
        mimeType: { type: String, default: "application/pdf" },
        version: { type: String, default: "1.0" },          // Template version
        uploadedAt: { type: Date, default: null },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
        // Additional template fields
        hasFillableFields: { type: Boolean, default: false },
        requiresSignature: { type: Boolean, default: false },
        requiresCompanyStamp: { type: Boolean, default: false }
    },

    /**
     * =====================================================
     * SAMPLE DOCUMENT (For sample_view type)
     * User can view sample document to understand format
     * =====================================================
     */
    sampleDocument: {
        fileUrl: { type: String, default: null },           // URL to view sample
        fileName: { type: String, default: null },
        fileSize: { type: Number, default: 0 },
        mimeType: { type: String, default: "application/pdf" },
        description: { type: String, default: "" },         // Description of sample
        previewImage: { type: String, default: null }       // Thumbnail/preview
    },

    /**
     * =====================================================
     * GLOBAL OR BANK SPECIFIC
     * =====================================================
     */
    isGlobal: {
        type: Boolean,
        default: true,
        index: true
    },

    applicableBanks: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Bank"
    }],

    /**
     * =====================================================
     * EMPLOYMENT RULES
     * =====================================================
     */
    applicableEmploymentTypes: [{
        type: String,
        enum: ["Salaried", "Self-Employed", "Both"],
        default: "Both"
    }],

    applicableResidencyStatuses: [{
        type: String,
        enum: ["UAE National", "UAE Resident", "Non-Resident", "All"],
        default: "All"
    }],

    applicableMortgageTypes: [{
        type: String,
        enum: ["Islamic", "Conventional", "Both"],
        default: "Both"
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

    requiresSignature: {
        type: Boolean,
        default: false
    },

    requiresStamp: {
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

    allowedFileTypes: [{
        type: String,
        enum: ["pdf", "jpg", "jpeg", "png", "doc", "docx"]
    }],

    maxFileSizeMB: {
        type: Number,
        default: 10
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

    instructions: {
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
        enum: ["Active", "Inactive", "Archived"],
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

// Indexes
DocumentRequirementSchema.index({ documentKey: 1 });
DocumentRequirementSchema.index({ isGlobal: 1 });
DocumentRequirementSchema.index({ applicableBanks: 1 });
DocumentRequirementSchema.index({ documentType: 1 });
DocumentRequirementSchema.index({ category: 1, status: 1 });
DocumentRequirementSchema.index({ status: 1, isDeleted: 1 });

// Virtuals
DocumentRequirementSchema.virtual("hasTemplate").get(function () {
    return this.documentType === "template_download" && !!this.template?.fileUrl;
});

DocumentRequirementSchema.virtual("hasSampleDocument").get(function () {
    return this.documentType === "sample_view" && !!this.sampleDocument?.fileUrl;
});

DocumentRequirementSchema.virtual("isDirectUpload").get(function () {
    return this.documentType === "direct_upload";
});

DocumentRequirementSchema.virtual("isTemplateDownload").get(function () {
    return this.documentType === "template_download";
});

DocumentRequirementSchema.virtual("isSampleView").get(function () {
    return this.documentType === "sample_view";
});

DocumentRequirementSchema.virtual("isActive").get(function () {
    return this.status === "Active" && !this.isDeleted;
});

// Methods
DocumentRequirementSchema.methods.softDelete = async function () {
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.status = "Archived";
    return this.save();
};

DocumentRequirementSchema.methods.restore = async function () {
    this.isDeleted = false;
    this.deletedAt = null;
    this.status = "Active";
    return this.save();
};

DocumentRequirementSchema.methods.updateTemplate = async function (fileData, userId) {
    this.template = {
        fileUrl: fileData.url,
        fileName: fileData.originalName,
        fileSize: fileData.size,
        mimeType: fileData.mimeType,
        version: this.template?.version ? `${parseFloat(this.template.version) + 0.1}` : "1.0",
        uploadedAt: new Date(),
        uploadedBy: userId
    };
    return this.save();
};

DocumentRequirementSchema.methods.updateSampleDocument = async function (fileData) {
    this.sampleDocument = {
        fileUrl: fileData.url,
        fileName: fileData.originalName,
        fileSize: fileData.size,
        mimeType: fileData.mimeType,
        description: fileData.description || this.sampleDocument?.description || ""
    };
    return this.save();
};

// Static Methods
DocumentRequirementSchema.statics.getRequiredDocuments = async function ({
    bankId,
    employmentType,
    residencyStatus,
    mortgageType
}) {
    // When no bank is selected, fetch global documents only
    // When bank is selected, fetch global + that bank's specific documents
    const bankFilter = bankId
        ? { $or: [{ isGlobal: true }, { applicableBanks: bankId }] }
        : { isGlobal: true };

    const query = {
        status: "Active",
        isDeleted: false,
        $and: [
            bankFilter,
            { applicableEmploymentTypes: { $in: [employmentType, "Both"] } },
            { applicableResidencyStatuses: { $in: [residencyStatus, "All"] } },
            { applicableMortgageTypes: { $in: [mortgageType, "Both"] } }
        ]
    };

    return this.find(query).sort({ displayOrder: 1 });
};

/**
 * Get documents by type
 */
DocumentRequirementSchema.statics.getByType = async function (type) {
    return this.find({
        documentType: type,
        status: "Active",
        isDeleted: false
    }).sort({ displayOrder: 1 });
};

module.exports = mongoose.model("BankDocumentRequirement", DocumentRequirementSchema);