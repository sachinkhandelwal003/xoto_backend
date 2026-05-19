const mongoose = require('mongoose');

// ==================== EMBEDDED SCHEMAS ====================

// Customer Info (copied from Lead)
const clientPersonalSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    mobile: { type: String, required: true },
    nationality: { type: String, required: true },
    residencyStatus: { type: String, enum: ['UAE National', 'UAE Resident', 'Non-Resident'], required: true },
    employmentStatus: { type: String, enum: ['Salaried', 'Self-Employed'], required: true }
  },
  { _id: false }
);

// Property Info (from Lead)
const propertySchema = new mongoose.Schema(
  {
    propertyValue: { type: Number, required: true },
    loanAmount: { type: Number, required: true },
    propertyAddress: {
      area: { type: String, required: true },
      city: { type: String, default: 'Dubai' }
    }
  },
  { _id: false }
);

// Bank Selection (Customer's choice)
const bankSelectionSchema = new mongoose.Schema(
  {
    bankId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bank', required: true },
    bankName: { type: String, required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankMortgageProducts', required: true },
    productName: { type: String, required: true },
    interestRate: { type: Number, required: true },
    tenureYears: { type: Number, required: true, default: 25 },
    monthlyEMI: { type: Number, required: true }
  },
  { _id: false }
);

// ==================== ELIGIBILITY SNAPSHOT SCHEMA ====================
const eligibilitySnapshotSchema = new mongoose.Schema(
  {
    checkedAt: { type: Date, default: null },
    isEligible: { type: Boolean, default: false },
    dbrPercentage: { type: Number, default: 0 },
    dbrStatus: { type: String, enum: ['Eligible', 'Borderline', 'Ineligible', 'Not Checked'], default: 'Not Checked' },
    estimatedLTV: { type: Number, default: 0 },
    eligibilityScore: { type: Number, default: 0 },
    riskGrade: { type: String, default: null },
    recommendedLoanAmount: { type: Number, default: 0 },
    eligibilityNotes: { type: String, default: null }
  },
  { _id: false }
);

// ==================== ✅ NEW: DOCUMENT SUMMARY SCHEMA (Simplified) ====================
const documentSummarySchema = new mongoose.Schema(
  {
    totalRequired: { type: Number, default: 0 },
    uploadedCount: { type: Number, default: 0 },
    verifiedCount: { type: Number, default: 0 },
    completionPercentage: { type: Number, default: 0 },
    allUploaded: { type: Boolean, default: false },
    allVerified: { type: Boolean, default: false },
    advisorRequired: { type: Number, default: 0 },
    advisorUploaded: { type: Number, default: 0 },
    opsRequired: { type: Number, default: 0 },
    opsUploaded: { type: Number, default: 0 }
  },
  { _id: false }
);

// Ops Queue
const opsQueueSchema = new mongoose.Schema(
  {
    enteredQueueAt: { type: Date, default: null },
    pickedUpBy: {
      opsId: { type: mongoose.Schema.Types.ObjectId, ref: 'MortgageOps', default: null },
      opsName: { type: String, default: null },
      pickedUpAt: { type: Date, default: null }
    },
    returnedToQueue: {
      returnedAt: { type: Date, default: null },
      returnedBy: { type: String, default: null },
      reason: { type: String, default: null }
    },
    returnCount: { type: Number, default: 0 },
    adminAssigned: {
      assignedAt: { type: Date, default: null },
      assignedBy: { type: String, default: null }
    }
  },
  { _id: false }
);

// Timeline
const timelineSchema = new mongoose.Schema(
  {
    createdAt: { type: Date, default: Date.now },
    submittedToXotoAt: { type: Date, default: null },
    assignedToOpsAt: { type: Date, default: null },
    submittedToBankAt: { type: Date, default: null },
    preApprovedAt: { type: Date, default: null },
    valuationAt: { type: Date, default: null },
    folProcessedAt: { type: Date, default: null },
    folIssuedAt: { type: Date, default: null },
    folSignedAt: { type: Date, default: null },
    disbursedAt: { type: Date, default: null }
  },
  { _id: false }
);

// ==================== MAIN CASE SCHEMA ====================
const caseSchema = new mongoose.Schema(
  {
    caseReference: { type: String, unique: true, required: true },
    sourceLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'VaultLead', required: true },
    proposalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Proposal', default: null },

    // Created by (Advisor OR Partner)
    createdBy: {
      role: { type: String, enum: ['advisor', 'partner'], required: true },
      userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      userName: { type: String, required: true },
      createdAt: { type: Date, default: Date.now }
    },

    // Customer Info
    clientInfo: { type: clientPersonalSchema, required: true },
    
    // Property Info
    propertyInfo: { type: propertySchema, required: true },
    
    // Bank Selection
    bankSelection: { type: bankSelectionSchema, required: true },

    // Eligibility Snapshot (copied from Lead)
    eligibilitySnapshot: { type: eligibilitySnapshotSchema, default: () => ({}) },

    // ✅ NEW: Simplified Document Summary (instead of embedded documents)
    documentSummary: { type: documentSummarySchema, default: () => ({}) },

    // Ops Queue Management
    opsQueue: { type: opsQueueSchema, default: () => ({}) },

    // Timeline
    timeline: { type: timelineSchema, default: () => ({ createdAt: new Date() }) },

    // Current Status (PRD Section 5.3)
    currentStatus: {
      type: String,
      enum: [
        'Draft',
        'Submitted to Xoto',
        'In Ops Queue - Pending Pick-up',
        'Assigned - Pending Review',
        'Under Review',
        'Returned - Pending Correction',
        'Submitted to Bank',
        'Pre-Approved',
        'Valuation',
        'FOL Processed',
        'FOL Issued',
        'FOL Signed',
        'Disbursed',
        'Lost',
        'Rejected'
      ],
      default: 'Draft'
    },

    // Notes (Array of strings)
    internalNotes: [{ type: String }],
    customerNotes: [{ type: String }],

    // Submission tracking
    advisorSubmittedAt: { type: Date, default: null },
    notesToOps: { type: String, default: null },

    // Bank Submission Info
    bankSubmission: {
      submittedToBankAt: { type: Date, default: null },
      bankReferenceNumber: { type: String, default: null }
    },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// ==================== INDEXES ====================
caseSchema.index({ caseReference: 1 }, { unique: true });
caseSchema.index({ sourceLeadId: 1 });
caseSchema.index({ currentStatus: 1 });
caseSchema.index({ 'opsQueue.pickedUpBy.opsId': 1 });
caseSchema.index({ 'createdBy.userId': 1 });
caseSchema.index({ createdAt: -1 });

// ==================== HELPER FUNCTIONS ====================
function calculateEMI(principal, annualRate, tenureYears) {
  if (principal <= 0 || annualRate <= 0 || tenureYears <= 0) return 0;
  const monthlyRate = annualRate / 100 / 12;
  const months = tenureYears * 12;
  const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, months) /
    (Math.pow(1 + monthlyRate, months) - 1);
  return Math.round(emi);
}

// ==================== ✅ NEW: UPDATE DOCUMENT SUMMARY ====================
caseSchema.methods.updateDocumentSummary = async function() {
  try {
    const CaseDocumentRequirement = mongoose.model('CaseDocumentRequirement');
    
    if (!CaseDocumentRequirement) {
      console.warn('CaseDocumentRequirement model not loaded yet');
      return this.documentSummary;
    }
    
    const stats = await CaseDocumentRequirement.aggregate([
      { $match: { caseId: this._id, isDeleted: false } },
      { $group: {
        _id: null,
        totalRequired: { $sum: 1 },
        uploadedCount: { $sum: { $cond: ['$isUploaded', 1, 0] } },
        verifiedCount: { $sum: { $cond: ['$isVerified', 1, 0] } },
        advisorRequired: { $sum: { $cond: [{ $eq: ['$handledBy', 'Advisor'] }, 1, 0] } },
        advisorUploaded: { $sum: { $cond: [{ $and: [{ $eq: ['$handledBy', 'Advisor'] }, { $eq: ['$isUploaded', true] }] }, 1, 0] } },
        opsRequired: { $sum: { $cond: [{ $eq: ['$handledBy', 'Ops'] }, 1, 0] } },
        opsUploaded: { $sum: { $cond: [{ $and: [{ $eq: ['$handledBy', 'Ops'] }, { $eq: ['$isUploaded', true] }] }, 1, 0] } }
      }}
    ]);
    
    if (stats.length > 0) {
      this.documentSummary = {
        totalRequired: stats[0].totalRequired,
        uploadedCount: stats[0].uploadedCount,
        verifiedCount: stats[0].verifiedCount,
        completionPercentage: stats[0].totalRequired > 0 ? Math.round((stats[0].uploadedCount / stats[0].totalRequired) * 100) : 0,
        allUploaded: stats[0].uploadedCount === stats[0].totalRequired,
        allVerified: stats[0].verifiedCount === stats[0].totalRequired,
        advisorRequired: stats[0].advisorRequired,
        advisorUploaded: stats[0].advisorUploaded,
        opsRequired: stats[0].opsRequired,
        opsUploaded: stats[0].opsUploaded
      };
      await this.save();
    } else {
      // No documents yet
      this.documentSummary = {
        totalRequired: 0,
        uploadedCount: 0,
        verifiedCount: 0,
        completionPercentage: 0,
        allUploaded: false,
        allVerified: false,
        advisorRequired: 0,
        advisorUploaded: 0,
        opsRequired: 0,
        opsUploaded: 0
      };
      await this.save();
    }
    
    return this.documentSummary;
  } catch (error) {
    console.error('Error updating document summary:', error);
    return this.documentSummary;
  }
};

// ==================== ✅ NEW: CHECK IF READY FOR SUBMISSION ====================
caseSchema.methods.isReadyForSubmission = async function() {
  try {
    const CaseDocumentRequirement = mongoose.model('CaseDocumentRequirement');
    
    const pendingAdvisorDocs = await CaseDocumentRequirement.countDocuments({
      caseId: this._id,
      handledBy: 'Advisor',
      isUploaded: false,
      isDeleted: false
    });
    
    return pendingAdvisorDocs === 0;
  } catch (error) {
    console.error('Error checking submission readiness:', error);
    return false;
  }
};

// ==================== ✅ UPDATED SUBMIT METHOD ====================
caseSchema.methods.submitToXoto = async function() {
  const isReady = await this.isReadyForSubmission();
  if (!isReady) {
    throw new Error('All required documents must be uploaded before submitting');
  }
  
  this.currentStatus = 'Submitted to Xoto';
  this.timeline.submittedToXotoAt = new Date();
  this.advisorSubmittedAt = new Date();
  return this.save();
};

// ==================== OPS QUEUE METHODS ====================
caseSchema.methods.enterOpsQueue = async function() {
  if (this.currentStatus !== 'Submitted to Xoto') {
    throw new Error('Case must be in "Submitted to Xoto" status');
  }
  
  this.currentStatus = 'In Ops Queue - Pending Pick-up';
  this.opsQueue.enteredQueueAt = new Date();
  this.opsQueue.returnCount = 0;
  return this.save();
};

caseSchema.methods.pickUpFromQueue = async function(opsId, opsName) {
  if (this.currentStatus !== 'In Ops Queue - Pending Pick-up') {
    throw new Error('Case is not in the ops queue');
  }
  
  this.currentStatus = 'Assigned - Pending Review';
  this.opsQueue.pickedUpBy = {
    opsId,
    opsName,
    pickedUpAt: new Date()
  };
  this.timeline.assignedToOpsAt = new Date();
  return this.save();
};

caseSchema.methods.returnToQueue = async function(opsId, reason) {
  if (this.currentStatus !== 'Assigned - Pending Review') {
    throw new Error('Only assigned cases can be returned to queue');
  }
  
  if (!reason || reason.trim() === '') {
    throw new Error('Valid reason required to return case to queue');
  }
  
  this.currentStatus = 'In Ops Queue - Pending Pick-up';
  this.opsQueue.returnedToQueue = {
    returnedAt: new Date(),
    returnedBy: opsId,
    reason: reason
  };
  this.opsQueue.returnCount = (this.opsQueue.returnCount || 0) + 1;
  this.opsQueue.pickedUpBy = null;
  
  return this.save();
};

caseSchema.methods.adminAssignToOps = async function(opsId, opsName, adminName) {
  if (this.currentStatus !== 'In Ops Queue - Pending Pick-up') {
    throw new Error('Case must be in queue for manual assignment');
  }
  
  this.currentStatus = 'Assigned - Pending Review';
  this.opsQueue.pickedUpBy = {
    opsId,
    opsName,
    pickedUpAt: new Date()
  };
  this.opsQueue.adminAssigned = {
    assignedAt: new Date(),
    assignedBy: adminName
  };
  this.timeline.assignedToOpsAt = new Date();
  return this.save();
};

// Add this method to Case model for updating document summary

caseSchema.methods.updateDocumentSummary = async function() {
  try {
    const CaseDocumentRequirement = mongoose.model('CaseDocumentRequirement');
    
    const stats = await CaseDocumentRequirement.aggregate([
      { $match: { caseId: this._id, isDeleted: false } },
      { $group: {
        _id: null,
        totalRequired: { $sum: 1 },
        uploadedCount: { $sum: { $cond: ['$isUploaded', 1, 0] } },
        verifiedCount: { $sum: { $cond: ['$isVerified', 1, 0] } },
        advisorRequired: { $sum: { $cond: [{ $eq: ['$handledBy', 'Advisor'] }, 1, 0] } },
        advisorUploaded: { $sum: { $cond: [{ $and: [{ $eq: ['$handledBy', 'Advisor'] }, { $eq: ['$isUploaded', true] }] }, 1, 0] } },
        opsRequired: { $sum: { $cond: [{ $eq: ['$handledBy', 'Ops'] }, 1, 0] } },
        opsUploaded: { $sum: { $cond: [{ $and: [{ $eq: ['$handledBy', 'Ops'] }, { $eq: ['$isUploaded', true] }] }, 1, 0] } }
      }}
    ]);
    
    if (stats.length > 0) {
      this.documentSummary = {
        totalRequired: stats[0].totalRequired,
        uploadedCount: stats[0].uploadedCount,
        verifiedCount: stats[0].verifiedCount,
        completionPercentage: stats[0].totalRequired > 0 ? Math.round((stats[0].uploadedCount / stats[0].totalRequired) * 100) : 0,
        allUploaded: stats[0].uploadedCount === stats[0].totalRequired,
        allVerified: stats[0].verifiedCount === stats[0].totalRequired,
        advisorRequired: stats[0].advisorRequired,
        advisorUploaded: stats[0].advisorUploaded,
        opsRequired: stats[0].opsRequired,
        opsUploaded: stats[0].opsUploaded
      };
      await this.save();
    }
    
    return this.documentSummary;
  } catch (error) {
    console.error('Error updating document summary:', error);
    return this.documentSummary;
  }
};


// ==================== BANK STATUS METHODS ====================
caseSchema.methods.updateBankStatus = async function(status, bankRef = null) {
  const validStatuses = ['Submitted to Bank', 'Pre-Approved', 'Valuation', 'FOL Processed', 'FOL Issued', 'FOL Signed', 'Disbursed', 'Rejected', 'Lost'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  
  this.currentStatus = status;
  
  if (status === 'Submitted to Bank') {
    this.timeline.submittedToBankAt = new Date();
    this.bankSubmission.submittedToBankAt = new Date();
    if (bankRef) this.bankSubmission.bankReferenceNumber = bankRef;
  }
  if (status === 'Pre-Approved') this.timeline.preApprovedAt = new Date();
  if (status === 'Valuation') this.timeline.valuationAt = new Date();
  if (status === 'FOL Processed') this.timeline.folProcessedAt = new Date();
  if (status === 'FOL Issued') this.timeline.folIssuedAt = new Date();
  if (status === 'FOL Signed') this.timeline.folSignedAt = new Date();
  if (status === 'Disbursed') this.timeline.disbursedAt = new Date();
  
  return this.save();
};

// ==================== PRE-SAVE MIDDLEWARE ====================
caseSchema.pre('save', function(next) {
  // Calculate EMI if not provided
  if (this.bankSelection && this.propertyInfo && this.propertyInfo.loanAmount) {
    if (!this.bankSelection.monthlyEMI || this.bankSelection.monthlyEMI === 0) {
      this.bankSelection.monthlyEMI = calculateEMI(
        this.propertyInfo.loanAmount,
        this.bankSelection.interestRate,
        this.bankSelection.tenureYears
      );
    }
  }
  next();
});

const Case = mongoose.models.Case || mongoose.model('Case', caseSchema);
module.exports = Case;