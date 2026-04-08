const mongoose = require('mongoose');
const crypto = require('crypto');

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
    proposalId: { type: String, unique: true, required: true },

    createdBy: {
      partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
      partnerName: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    },

    clientInfo: { type: clientInfoSchema, required: true },
    clientRequirements: { type: requirementsSchema, required: true },

    selectedBankProducts: [bankProductSchema],

    coverNote: { type: String, default: null },
    internalNotes: { type: String, default: null },

    status: {
      type: String,
      enum: ['Draft', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired'],
      default: 'Draft',
    },

    pdfUrl: { type: String, default: null },
    secureLink: { type: String, unique: true, sparse: true },
    secureLinkExpiry: { type: Date, default: null },

    sentAt: { type: Date, default: null },
    sentTo: { type: String, default: null },
    viewedAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    expiredAt: { type: Date, default: null },

    convertedToCase: { type: Boolean, default: false },
    convertedCaseId: { type: String, default: null },
    convertedCaseReference: { type: String, default: null },
    convertedAt: { type: Date, default: null },

    pdfGenerationStatus: {
      type: String,
      enum: ['pending', 'generating', 'completed', 'failed'],
      default: 'pending',
    },
    pdfGenerationFailedReason: { type: String, default: null },

    version: { type: Number, default: 1 },
    previousVersionId: { type: String, default: null },

    expiryDays: { type: Number, default: 30 },
    expiresAt: { type: Date, default: null },

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

// Virtuals
proposalSchema.virtual('formattedPropertyValue').get(function () {
  return `${this.clientRequirements.targetPropertyValue.toLocaleString()} AED`;
});

proposalSchema.virtual('isExpired').get(function () {
  return this.expiresAt && new Date() > this.expiresAt;
});

proposalSchema.virtual('bestRateProduct').get(function () {
  if (!this.selectedBankProducts.length) return null;
  return this.selectedBankProducts.reduce((min, product) =>
    product.currentRate < min.currentRate ? product : min
  );
});

// Methods
proposalSchema.methods.send = function (clientEmail) {
  this.status = 'Sent';
  this.sentAt = new Date();
  this.sentTo = clientEmail;
  if (!this.expiresAt) {
    this.expiresAt = new Date();
    this.expiresAt.setDate(this.expiresAt.getDate() + this.expiryDays);
  }
  return this.save();
};

proposalSchema.methods.markAsViewed = function () {
  if (this.status === 'Sent') {
    this.status = 'Viewed';
    this.viewedAt = new Date();
  }
  return this.save();
};

proposalSchema.methods.accept = function () {
  this.status = 'Accepted';
  this.acceptedAt = new Date();
  return this.save();
};

proposalSchema.methods.reject = function (reason) {
  this.status = 'Rejected';
  this.rejectedAt = new Date();
  this.rejectionReason = reason;
  return this.save();
};

proposalSchema.methods.generateSecureLink = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.secureLink = `/proposal/view/${this.proposalId}?token=${token}`;
  this.secureLinkExpiry = new Date();
  this.secureLinkExpiry.setDate(this.secureLinkExpiry.getDate() + 7);
  return this.save();
};

proposalSchema.methods.convertToCase = function (caseId, caseReference) {
  this.convertedToCase = true;
  this.convertedCaseId = caseId;
  this.convertedCaseReference = caseReference;
  this.convertedAt = new Date();
  return this.save();
};

// Pre-save middleware
proposalSchema.pre('save', function (next) {
  if (!this.expiresAt && this.status === 'Sent') {
    this.expiresAt = new Date();
    this.expiresAt.setDate(this.expiresAt.getDate() + this.expiryDays);
  }
  if (this.selectedBankProducts.length > 3) {
    const error = new Error('Maximum 3 bank products can be selected');
    return next(error);
  }
  next();
});

const Proposal = mongoose.models.Proposal || mongoose.model('Proposal', proposalSchema);
module.exports = Proposal;