const mongoose = require("mongoose");

const BankFormSchema = new mongoose.Schema(
  {
    // Reference
    bankProductId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "BankMortgageProduct",
      required: true,
      index: true 
    },
    bankName: { type: String, required: true, index: true },
    bankCode: { type: String, required: true, index: true },
    
    // Document Identification
    formName: { type: String, required: true },
    formType: { 
      type: String, 
      enum: ["customer_document", "application_form", "consent_form", "disclosure_form", "noc_template", "other"],
      required: true 
    },
    formCategory: {
      type: String,
      enum: ["Pre-Approval", "Final Approval", "Disbursement", "General"],
      default: "General"
    },
    
    // NEW: Source & Action
    documentSource: { 
      type: String, 
      enum: ["Customer", "Bank"],
      default: "Customer"
    },
    actionType: { 
      type: String, 
      enum: ["direct_upload", "download_fill_upload"],
      default: "direct_upload"
    },
    
    // File Storage (Not required for customer docs initially)
    fileUrl: { type: String, default: "" },
    fileName: { type: String, default: "" },
    fileSize: { type: Number, default: 0 },
    mimeType: { type: String, default: "application/pdf" },
    
    // Version Control
    version: { type: String, default: "1.0" },
    previousVersionId: { type: mongoose.Schema.Types.ObjectId, ref: "BankForm" },
    isLatestVersion: { type: Boolean, default: true },
    
    // Applicability
    applicableEmploymentTypes: [{ 
      type: String, 
      enum: ["Salaried", "Self-Employed", "Both"],
      default: ["Both"]
    }],
    applicableResidencyStatus: [{ 
      type: String, 
      enum: ["UAE National", "UAE Resident", "Non-Resident", "All"],
      default: ["All"]
    }],
    applicableLoanTypes: [{
      type: String,
      enum: ["CONVENTIONAL", "ISLAMIC", "Both"],
      default: ["Both"]
    }],
    
    // Requirements
    isMandatory: { type: Boolean, default: true },
    requiresSignature: { type: Boolean, default: false },
    requiresAttestation: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    
    // Download Tracking
    downloadCount: { type: Number, default: 0 },
    lastDownloadedAt: { type: Date },
    downloadHistory: [{
      downloadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      downloadedAt: { type: Date, default: Date.now },
      userType: { type: String, enum: ["Partner", "Advisor", "Ops", "Admin"] },
      applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "Application" }
    }],
    
    // Status
    isActive: { type: Boolean, default: true },
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    
    // Admin Info
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    
    // Instructions
    description: { type: String, default: "" },
    fillInstructions: { type: String, default: "" },
    sampleFilledUrl: { type: String, default: "" }
  },
  { timestamps: true }
);

// Indexes
BankFormSchema.index({ bankProductId: 1 });
BankFormSchema.index({ applicableEmploymentTypes: 1, applicableResidencyStatus: 1 });

// Methods
BankFormSchema.methods.recordDownload = async function(userId, userType, applicationId = null) {
  this.downloadCount += 1;
  this.lastDownloadedAt = new Date();
  this.downloadHistory.push({ downloadedBy: userId, downloadedAt: new Date(), userType: userType, applicationId: applicationId });
  await this.save();
};

// Static Methods
BankFormSchema.statics.getFormsForBank = function(bankProductId, employmentType, residencyStatus, loanType = null) {
  const query = {
    bankProductId: bankProductId,
    isActive: true,
    isArchived: false,
    isLatestVersion: true,
    applicableEmploymentTypes: { $in: [employmentType, "Both"] },
    applicableResidencyStatus: { $in: [residencyStatus, "All"] }
  };
  if (loanType) query.applicableLoanTypes = { $in: [loanType, "Both"] };
  return this.find(query).sort({ order: 1 });
};
// ======================
// STATIC METHODS (Add to BankForm Schema)
// ======================

// Get all forms with filters
BankFormSchema.statics.getAllFormsWithFilters = function(filters = {}) {
  const query = {
    bankProductId: filters.bankProductId,
    isActive: filters.isActive !== undefined ? filters.isActive : true,
    isArchived: false,
    isLatestVersion: true
  };
  
  if (filters.documentSource) query.documentSource = filters.documentSource;
  if (filters.actionType) query.actionType = filters.actionType;
  if (filters.formType) query.formType = filters.formType;
  if (filters.formCategory) query.formCategory = filters.formCategory;
  if (filters.isMandatory !== undefined) query.isMandatory = filters.isMandatory;
  if (filters.search) query.formName = { $regex: filters.search, $options: 'i' };
  if (filters.applicableEmploymentType) {
    query.applicableEmploymentTypes = { $in: [filters.applicableEmploymentType, "Both"] };
  }
  if (filters.applicableResidencyStatus) {
    query.applicableResidencyStatus = { $in: [filters.applicableResidencyStatus, "All"] };
  }
  if (filters.applicableLoanType) {
    query.applicableLoanTypes = { $in: [filters.applicableLoanType, "Both"] };
  }
  
  return this.find(query).sort({ order: 1, formName: 1 });
};

// Get customer documents only
BankFormSchema.statics.getCustomerDocuments = function(bankProductId, employmentType, residencyStatus) {
  const query = {
    bankProductId: bankProductId,
    documentSource: "Customer",
    actionType: "direct_upload",
    isActive: true,
    isArchived: false,
    isLatestVersion: true
  };
  
  if (employmentType) {
    query.applicableEmploymentTypes = { $in: [employmentType, "Both"] };
  }
  if (residencyStatus) {
    query.applicableResidencyStatus = { $in: [residencyStatus, "All"] };
  }
  
  return this.find(query).sort({ order: 1 });
};

// Get bank forms only (downloadable)
BankFormSchema.statics.getBankForms = function(bankProductId, employmentType, residencyStatus) {
  const query = {
    bankProductId: bankProductId,
    documentSource: "Bank",
    actionType: "download_fill_upload",
    isActive: true,
    isArchived: false,
    isLatestVersion: true
  };
  
  if (employmentType) {
    query.applicableEmploymentTypes = { $in: [employmentType, "Both"] };
  }
  if (residencyStatus) {
    query.applicableResidencyStatus = { $in: [residencyStatus, "All"] };
  }
  
  return this.find(query).sort({ order: 1 });
};

// Get forms by multiple IDs
BankFormSchema.statics.getFormsByIds = function(ids) {
  return this.find({
    _id: { $in: ids },
    isActive: true,
    isArchived: false,
    isLatestVersion: true
  }).sort({ order: 1 });
};
BankFormSchema.set("toJSON", { virtuals: true });
BankFormSchema.set("toObject", { virtuals: true });

const BankForm = mongoose.model("BankForm", BankFormSchema, "BankForms");
module.exports = BankForm;