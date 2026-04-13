const mongoose = require('mongoose');
const crypto = require('crypto');

// Reference to Bank Product (from BankProduct master)
const selectedBankProductSchema = new mongoose.Schema(
  {
    bankProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankProduct', required: true },
    snapshotRate: { type: Number, required: true },
    snapshotFeatures: [{ type: String }],
    snapshotMaxLtv: { type: Number, required: true },
  },
  { _id: false }
);

const proposalSchema = new mongoose.Schema(
  {
    // Reference to Lead (source of truth)
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'VaultLead', required: true },

    // Who created this proposal
    createdBy: {
      role: { type: String, enum: ['Admin', 'Partner', 'Agent'], required: true },
      userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      userName: { type: String, required: true },
      partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', default: null },
      createdAt: { type: Date, default: Date.now },
    },

    // Client requirements (copied from lead at proposal time)
    clientRequirements: {
      targetPropertyValue: { type: Number, required: true },
      preferredLoanTenureYears: { type: Number, required: true },
      propertyType: { type: String, enum: ['Ready', 'Off-plan', 'Commercial'], required: true },
      feeFinancingPreference: { type: Boolean, default: true },
      bankPreferences: [{ type: String }],
      bankExclusions: [{ type: String }],
    },

    // Selected Bank Products (references to BankProduct master)
    selectedBankProducts: [selectedBankProductSchema],

    // Notes
    coverNote: { type: String, default: null },
    internalNotes: { type: String, default: null },

    // Status
    status: {
      type: String,
      enum: ['Draft', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired'],
      default: 'Draft',
    },

    // PDF & Links
    pdfUrl: { type: String, default: null },
    secureLink: { type: String, unique: true, sparse: true },
    secureLinkExpiry: { type: Date, default: null },

    // Tracking
    sentAt: { type: Date, default: null },
    sentTo: { type: String, default: null },
    viewedAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    expiredAt: { type: Date, default: null },

    // Case Conversion
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
    deletedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

// Indexes
proposalSchema.index({ leadId: 1 });
proposalSchema.index({ secureLink: 1 }, { unique: true, sparse: true });
proposalSchema.index({ 'createdBy.userId': 1 });
proposalSchema.index({ status: 1 });
proposalSchema.index({ createdAt: -1 });
proposalSchema.index({ convertedToCase: 1 });

// Virtuals
proposalSchema.virtual('proposalId').get(function () {
  return this._id.toString();
});

proposalSchema.virtual('isExpired').get(function () {
  return this.expiresAt && new Date() > this.expiresAt;
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

proposalSchema.methods.generateSecureLink = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.secureLink = `/proposal/view/${this._id}?token=${token}`;
  this.secureLinkExpiry = new Date();
  this.secureLinkExpiry.setDate(this.secureLinkExpiry.getDate() + 7);
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

proposalSchema.methods.convertToCase = function (caseId, caseReference) {
  this.convertedToCase = true;
  this.convertedCaseId = caseId;
  this.convertedCaseReference = caseReference;
  this.convertedAt = new Date();
  return this.save();
};

// Get client info from lead
proposalSchema.methods.getClientInfo = async function () {
  const Lead = mongoose.model('VaultLead');
  const lead = await Lead.findById(this.leadId);
  if (!lead) return null;
  
  const calculateAge = (dob) => {
    if (!dob) return null;
    const ageDiff = Date.now() - new Date(dob).getTime();
    const ageDate = new Date(ageDiff);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
  };
  
  return {
    name: lead.customerInfo.fullName,
    email: lead.customerInfo.email,
    phone: lead.customerInfo.mobileNumber,
    monthlySalary: lead.customerInfo.monthlySalary,
    nationality: lead.customerInfo.nationality,
    age: calculateAge(lead.customerInfo.dateOfBirth),
    propertyValue: lead.propertyDetails.propertyValue,
    propertyType: lead.propertyDetails.propertyType,
  };
};

// ✅ FIXED: Static method to create proposal from lead
proposalSchema.statics.createFromLead = async function (leadId, selectedBankProducts, coverNote, userInfo) {
  const Lead = mongoose.model('VaultLead');
  const lead = await Lead.findById(leadId);
  
  if (!lead) throw new Error('Lead not found');
  if (lead.currentStatus !== 'Qualified') {
    throw new Error(`Lead status must be Qualified. Current: ${lead.currentStatus}`);
  }
  
  const existingProposal = await this.findOne({ leadId, isDeleted: false });
  if (existingProposal) throw new Error('A proposal already exists for this lead');
  
  // ✅ FIXED: Use userInfo.userRole, not userInfo.role
  const proposal = await this.create({
    leadId,
    createdBy: {
      role: userInfo.userRole,  // ✅ This is 'Partner', 'Admin', or 'Agent'
      userId: userInfo.userId,
      userName: userInfo.userName,
      partnerId: userInfo.partnerId || null,
      createdAt: new Date(),
    },
    clientRequirements: {
      targetPropertyValue: lead.propertyDetails.propertyValue,
      preferredLoanTenureYears: 25,
      propertyType: lead.propertyDetails.propertyType,
      feeFinancingPreference: true,
      bankPreferences: [],
      bankExclusions: [],
    },
    selectedBankProducts: selectedBankProducts.map(p => ({
      bankProductId: p.bankProductId,
      snapshotRate: p.snapshotRate,
      snapshotFeatures: p.snapshotFeatures || [],
      snapshotMaxLtv: p.snapshotMaxLtv,
    })),
    coverNote: coverNote || null,
    status: 'Draft',
  });
  
  lead.conversionInfo.proposalId = proposal._id;
  await lead.save();
  
  return proposal;
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

proposalSchema.set('toJSON', { virtuals: true });
proposalSchema.set('toObject', { virtuals: true });

const Proposal = mongoose.models.Proposal || mongoose.model('Proposal', proposalSchema);
module.exports = Proposal;