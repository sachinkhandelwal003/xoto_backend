
import mongoose from "mongoose";

const clientInfoSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    phone: { type: String, required: true },
    residencyStatus: { type: String, enum: ['UAE Resident', 'Non-Resident'], required: true },
    employmentStatus: { type: String, enum: ['Salaried', 'Self-Employed'], required: true },
    monthlySalary: { type: Number, required: true },
    nationality: { type: String, required: true },
    age: { type: Number, required: true },
  },
  { _id: false }
);

const requirementsSchema = new mongoose.Schema(
  {
    targetPropertyValue: { type: Number, required: true },
    preferredLoanTenureYears: { type: Number, required: true },
    propertyType: { type: String, enum: ['Ready', 'Off-plan', 'Commercial'], required: true },
    feeFinancingPreference: { type: Boolean, default: true },
    bankPreferences: [{ type: String }],
    bankExclusions: [{ type: String }],
  },
  { _id: false }
);

const bankProductSchema = new mongoose.Schema(
  {
    bankName: { type: String, required: true },
    productName: { type: String, required: true },
    rateType: { type: String, enum: ['Fixed', 'Variable'], required: true },
    currentRate: { type: Number, required: true },
    maxLtv: { type: Number, required: true },
    minSalary: { type: Number, default: null },
    maxLoanAmount: { type: Number, default: null },
    processingFee: { type: Number, default: 0 },
    earlySettlementFee: { type: String, default: null },
    features: [{ type: String }],
    disclaimers: [{ type: String }],
  },
  { _id: false }
);

const proposalSchema = new mongoose.Schema(
  {
    // Unique Identifier
    proposalId: { type: String, unique: true, required: true },
    
    // Creation Info
    createdBy: {
      partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
      partnerName: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    },

    // Client Information
    clientInfo: { type: clientInfoSchema, required: true },
    clientRequirements: { type: requirementsSchema, required: true },

    // Selected Bank Products (max 3)
    selectedBankProducts: [bankProductSchema],

    // Cover Note / Message to Client
    coverNote: { type: String, default: null },
    
    // Additional Notes for Internal Use
    internalNotes: { type: String, default: null },

    // Status
    status: {
      type: String,
      enum: ['Draft', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired'],
      default: 'Draft',
    },
    
    statusHistory: [
      {
        status: { type: String, enum: ['Draft', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired'], required: true },
        timestamp: { type: Date, default: Date.now },
        notes: { type: String, default: null },
      },
    ],

    // Files & Links
    pdfUrl: { type: String, default: null },
    secureLink: { type: String, unique: true, sparse: true },
    secureLinkExpiry: { type: Date, default: null },

    // Tracking
    sentAt: { type: Date, default: null },
    sentTo: { type: String, default: null }, // email address
    viewedAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    expiredAt: { type: Date, default: null },

    // Conversion to Case
    convertedToCase: { type: Boolean, default: false },
    convertedCaseId: { type: String, default: null },
    convertedCaseReference: { type: String, default: null },
    convertedAt: { type: Date, default: null },

    // PDF Generation
    pdfGenerationStatus: {
      type: String,
      enum: ['pending', 'generating', 'completed', 'failed'],
      default: 'pending',
    },
    pdfGenerationFailedReason: { type: String, default: null },

    // Version Control
    version: { type: Number, default: 1 },
    previousVersionId: { type: String, default: null },

    // Expiry
    expiryDays: { type: Number, default: 30 },
    expiresAt: { type: Date, default: null },

    // Soft Delete
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', default: null },
  },
  { timestamps: true }
);

// Indexes
proposalSchema.index({ proposalId: 1 }, { unique: true });
proposalSchema.index({ secureLink: 1 }, { unique: true, sparse: true });
proposalSchema.index({ 'createdBy.partnerId': 1 });
proposalSchema.index({ status: 1 });
proposalSchema.index({ createdAt: -1 });
proposalSchema.index({ expiresAt: 1 });
proposalSchema.index({ 'clientInfo.email': 1 });
proposalSchema.index({ convertedToCase: 1 });

// Virtual for formatted property value
proposalSchema.virtual('formattedPropertyValue').get(function () {
  return `${this.clientRequirements.targetPropertyValue.toLocaleString()} AED`;
});

// Virtual for formatted monthly salary
proposalSchema.virtual('formattedMonthlySalary').get(function () {
  return `${this.clientInfo.monthlySalary.toLocaleString()} AED`;
});

// Virtual for is expired
proposalSchema.virtual('isExpired').get(function () {
  return this.expiresAt && new Date() > this.expiresAt;
});

// Virtual for best rate product
proposalSchema.virtual('bestRateProduct').get(function () {
  if (!this.selectedBankProducts.length) return null;
  return this.selectedBankProducts.reduce((min, product) => 
    product.currentRate < min.currentRate ? product : min
  );
});

// Method to send proposal
proposalSchema.methods.send = function (clientEmail) {
  this.status = 'Sent';
  this.sentAt = new Date();
  this.sentTo = clientEmail;
  
  // Set expiry date if not set
  if (!this.expiresAt) {
    this.expiresAt = new Date();
    this.expiresAt.setDate(this.expiresAt.getDate() + this.expiryDays);
  }
  
  this.statusHistory.push({
    status: 'Sent',
    timestamp: new Date(),
    notes: `Sent to ${clientEmail}`,
  });
  return this.save();
};

// Method to mark as viewed
proposalSchema.methods.markAsViewed = function () {
  if (this.status === 'Sent') {
    this.status = 'Viewed';
    this.viewedAt = new Date();
    this.statusHistory.push({
      status: 'Viewed',
      timestamp: new Date(),
      notes: 'Client viewed the proposal',
    });
  }
  return this.save();
};

// Method to accept proposal
proposalSchema.methods.accept = function () {
  this.status = 'Accepted';
  this.acceptedAt = new Date();
  this.statusHistory.push({
    status: 'Accepted',
    timestamp: new Date(),
    notes: 'Client accepted the proposal',
  });
  return this.save();
};

// Method to reject proposal
proposalSchema.methods.reject = function (reason) {
  this.status = 'Rejected';
  this.rejectedAt = new Date();
  this.rejectionReason = reason;
  this.statusHistory.push({
    status: 'Rejected',
    timestamp: new Date(),
    notes: reason || 'Client rejected the proposal',
  });
  return this.save();
};

// Method to mark as expired
proposalSchema.methods.markAsExpired = function () {
  this.status = 'Expired';
  this.expiredAt = new Date();
  this.statusHistory.push({
    status: 'Expired',
    timestamp: new Date(),
    notes: 'Proposal expired',
  });
  return this.save();
};

// Method to generate secure link
proposalSchema.methods.generateSecureLink = function () {
  const token = require('crypto').randomBytes(32).toString('hex');
  this.secureLink = `/proposal/view/${this.proposalId}?token=${token}`;
  this.secureLinkExpiry = new Date();
  this.secureLinkExpiry.setDate(this.secureLinkExpiry.getDate() + 7); // 7 days expiry
  return this.save();
};

// Method to create new version
proposalSchema.methods.createNewVersion = async function (updatedData) {
  const newVersion = new this.constructor({
    ...updatedData,
    proposalId: `${this.proposalId}-v${this.version + 1}`,
    version: this.version + 1,
    previousVersionId: this.proposalId,
    status: 'Draft',
    statusHistory: [{
      status: 'Draft',
      timestamp: new Date(),
      notes: `New version created from ${this.proposalId}`,
    }],
  });
  
  await newVersion.save();
  return newVersion;
};

// Method to convert to case
proposalSchema.methods.convertToCase = function (caseId, caseReference) {
  this.convertedToCase = true;
  this.convertedCaseId = caseId;
  this.convertedCaseReference = caseReference;
  this.convertedAt = new Date();
  return this.save();
};

// Static method to create from template
proposalSchema.statics.createFromTemplate = async function (templateData, partnerId, partnerName) {
  const proposalId = `PR-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  
  const proposal = new this({
    proposalId,
    createdBy: { partnerId, partnerName, createdAt: new Date() },
    clientInfo: templateData.clientInfo,
    clientRequirements: templateData.clientRequirements,
    selectedBankProducts: templateData.selectedBankProducts,
    coverNote: templateData.coverNote,
    status: 'Draft',
    statusHistory: [{ status: 'Draft', timestamp: new Date(), notes: 'Proposal created from template' }],
  });
  
  await proposal.save();
  return proposal;
};

// Pre-save middleware to set expiry date
proposalSchema.pre('save', function (next) {
  if (!this.expiresAt && this.status === 'Sent') {
    this.expiresAt = new Date();
    this.expiresAt.setDate(this.expiresAt.getDate() + this.expiryDays);
  }
  next();
});

// Pre-save middleware to validate max 3 bank products
proposalSchema.pre('save', function (next) {
  if (this.selectedBankProducts.length > 3) {
    const error = new Error('Maximum 3 bank products can be selected');
    return next(error);
  }
  next();
});

const Proposal = mongoose.models.Proposal || mongoose.model('Proposal', proposalSchema);
export default Proposal;