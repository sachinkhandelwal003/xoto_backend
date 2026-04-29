const mongoose = require('mongoose');

const bankDetailsSchema = new mongoose.Schema(
  {
    beneficiaryName: { type: String, default: null },
    bankName: { type: String, default: null },
    accountNumber: { type: String, default: null },
    iban: { type: String, default: null },
    swiftCode: { type: String, default: null },
    branchName: { type: String, default: null },
 accountType: { 
      type: String, 
      enum: ['Business Current', 'Business Savings', 'Personal Current', 'Personal Savings', null], 
      default: null 
    },    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
  },
  { _id: false }
);

const addressSchema = new mongoose.Schema(
  {
    buildingName: { type: String, default: null },
    floorUnit: { type: String, default: null },
    area: { type: String, default: null },
    city: { type: String, default: null },
    poBox: { type: String, default: null },
    country: { type: String, default: 'UAE' },
  },
  { _id: false }
);

const contactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    designation: { type: String, default: null },
    email: { type: String, required: true, lowercase: true },
    countryCode: { type: String, required: true },
    phone: { type: String, required: true },
    alternativePhone: { type: String, default: null },
    whatsappNumber: { type: String, default: null },
    emiratesId: { type: String, default: null },
  },
  { _id: false }
);

// ✅ FIXED: Commission percentages to 80%/85% (per PRD)
const commissionTierSchema = new mongoose.Schema(
  {
    tier1: {
      loanAmountMax: { type: Number, default: 5000000 },
      commissionPercentage: { type: Number, default: 80 },  // ✅ Changed from 75 to 80
      description: { type: String, default: 'For loans up to 5M AED' },
    },
    tier2: {
      loanAmountMin: { type: Number, default: 5000001 },
      commissionPercentage: { type: Number, default: 85 },  // ✅ Changed from 80 to 85
      description: { type: String, default: 'For loans above 5M AED' },
    },
    paymentTerms: { type: String, default: 'Net 30 days after disbursement' },
    calculationBasis: { type: String, default: 'Percentage of Xoto\'s bank commission' },
  },
  { _id: false }
);

const agreementSchema = new mongoose.Schema(
  {
    agreementType: { type: String, default: 'Commercial Partnership Agreement' },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    autoRenew: { type: Boolean, default: true },
    signedByXoto: { type: String, default: 'Xoto Prophet LLC' },
    signedByPartner: { type: String, required: true },
    signedDate: { type: Date, required: true },
    documentUrl: { type: String, default: null },
  },
  { _id: false }
);

// ✅ NEW: Individual Partner Schema (for individual mortgage experts)
const individualPartnerSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    emiratesId: { type: String, required: true },
    nationality: { type: String, required: true },
    dateOfBirth: { type: Date, required: true },
  },
  { _id: false }
);

const partnerSchema = new mongoose.Schema(
  {
    // ✅ NEW: Partner Category (company or individual)
    partnerCategory: {
      type: String,
      enum: ['company', 'individual'],
      required: true,
      default: 'company'
    },

    // ==================== COMPANY FIELDS ====================
    companyName: { 
      type: String, 
      trim: true,
      validate: {
        validator: function(v) {
          if (this.partnerCategory === 'company') return v && v.length > 0;
          return true;
        },
        message: 'Company name required for company partner'
      }
    },
    legalEntityType: {
      type: String,
      enum: ['LLC', 'Sole Proprietorship', 'Branch Office', 'Free Zone Company'],
      validate: {
        validator: function(v) {
          if (this.partnerCategory === 'company') return v;
          return true;
        },
        message: 'Legal entity type required for company partner'
      }
    },
    tradeLicenseNumber: { 
      type: String, 
      unique: true,
      sparse: true,
      validate: {
        validator: function(v) {
          if (this.partnerCategory === 'company') return v && v.length > 0;
          return true;
        },
        message: 'Trade license number required for company partner'
      }
    },
    tradeLicenseIssueDate: { type: Date },
    tradeLicenseExpiryDate: { type: Date },
    
    // ✅ FIXED: Typo corrected
    isOfflineAgreement: { type: Boolean, default: true },  // ✅ Fixed spelling
    
    // ==================== INDIVIDUAL PARTNER FIELDS ====================
    individualDetails: {
      type: individualPartnerSchema,
      validate: {
        validator: function(v) {
          if (this.partnerCategory === 'individual') return v;
          return true;
        },
        message: 'Individual details required for individual partner'
      }
    },

    // ==================== COMMON FIELDS ====================
    taxRegistrationNumber: { type: String, default: null },
    dbaName: { type: String, default: null },
    website: { type: String, default: null },
    yearEstablished: { type: Number, default: null },
    numberOfBranches: { type: Number, default: 1 },
    numberOfAgents: { type: Number, default: 0 },
    
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      default: null
    },
    
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true
    },

    password: {
      type: String,
      required: true,
      select: false
    },

    // Contacts
    primaryContact: { type: contactSchema, required: true },
    secondaryContact: { type: contactSchema, default: null },

    // Addresses
    billingAddress: { type: addressSchema, required: true },
    shippingAddress: { type: addressSchema, default: null },

    // Bank Details
    bankDetails: { type: bankDetailsSchema, default: () => ({}) },

    // Commission Configuration (Updated to 80/85)
    commissionConfiguration: { type: commissionTierSchema, required: true },

    // Agreement Details
    agreementDetails: { type: agreementSchema, required: true },

    // Status
    status: {
      type: String,
      enum: ['pending', 'active', 'suspended', 'inactive'],
      default: 'pending',
    },
    onboardingCompleted: { type: Boolean, default: false },
    onboardedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    onboardedAt: { type: Date, default: null },
    dropdownAvailableFrom: { type: Date, default: null },
    suspendedAt: { type: Date, default: null },
    suspensionReason: { type: String, default: null },

    // Performance Metrics
    performanceMetrics: {
      totalCasesSubmitted: { type: Number, default: 0 },
      totalCasesApproved: { type: Number, default: 0 },
      totalCasesDisbursed: { type: Number, default: 0 },
      totalCommissionEarned: { type: Number, default: 0 },
      averageProcessingDays: { type: Number, default: 0 },
      conversionRate: { type: Number, default: 0 },
    },

    // Soft Delete
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Indexes
partnerSchema.index({ companyName: 1 }, { sparse: true });
partnerSchema.index({ tradeLicenseNumber: 1 }, { sparse: true });
partnerSchema.index({ email: 1 });
partnerSchema.index({ status: 1 });
partnerSchema.index({ isDeleted: 1 });
partnerSchema.index({ partnerCategory: 1 });

// ==================== VIRTUALS ====================

// Virtual for display name
partnerSchema.virtual('displayName').get(function () {
  if (this.partnerCategory === 'company') {
    return this.dbaName ? `${this.companyName} (${this.dbaName})` : this.companyName;
  }
  return `${this.individualDetails?.firstName} ${this.individualDetails?.lastName}`;
});

// Virtual for full company name (backward compatibility)
partnerSchema.virtual('fullCompanyName').get(function () {
  if (this.partnerCategory === 'company') {
    return this.dbaName ? `${this.companyName} (${this.dbaName})` : this.companyName;
  }
  return this.displayName;
});

// ==================== EXISTING METHODS ====================

// Method to check if partner is active
partnerSchema.methods.isActive = function () {
  return this.status === 'active' && !this.isDeleted;
};

// ✅ UPDATED: Get commission percentage based on loan amount (now returns 80/85)
partnerSchema.methods.getCommissionPercentage = function (loanAmount) {
  if (loanAmount <= this.commissionConfiguration.tier1.loanAmountMax) {
    return this.commissionConfiguration.tier1.commissionPercentage;
  }
  return this.commissionConfiguration.tier2.commissionPercentage;
};

// ==================== NEW METHODS FOR COMMISSION INTEGRATION ====================

// ✅ Method 1: Get commission eligibility status
partnerSchema.methods.getCommissionEligibilityStatus = function() {
  if (this.status !== 'active') {
    return { eligible: false, reason: `Partner status: ${this.status}` };
  }
  if (this.isDeleted) {
    return { eligible: false, reason: 'Partner account is deleted' };
  }
  if (!this.bankDetails?.iban) {
    return { eligible: false, reason: 'Bank details not provided' };
  }
  if (!this.bankDetails?.verified) {
    return { eligible: false, reason: 'Bank details not verified by admin' };
  }
  if (!this.agreementDetails?.signedDate) {
    return { eligible: false, reason: 'Agreement not signed' };
  }
  if (this.agreementDetails?.endDate && new Date() > this.agreementDetails.endDate) {
    return { eligible: false, reason: 'Agreement has expired' };
  }
  return { eligible: true, reason: null };
};

// ✅ Method 2: Get payout bank details for commission
partnerSchema.methods.getPayoutBankDetails = function() {
  if (!this.bankDetails?.iban) return null;
  
  return {
    beneficiaryName: this.bankDetails.beneficiaryName || this.companyName || this.displayName,
    bankName: this.bankDetails.bankName,
    iban: this.bankDetails.iban,
    swiftCode: this.bankDetails.swiftCode,
  };
};

// ✅ Method 3: Update metrics from commission
partnerSchema.methods.updateMetricsFromCommission = async function(commissionAmount, isDisbursed = true) {
  this.performanceMetrics.totalCommissionEarned += commissionAmount;
  
  if (isDisbursed) {
    this.performanceMetrics.totalCasesDisbursed += 1;
  }
  
  // Update conversion rate
  if (this.performanceMetrics.totalCasesSubmitted > 0) {
    this.performanceMetrics.conversionRate = 
      (this.performanceMetrics.totalCasesDisbursed / this.performanceMetrics.totalCasesSubmitted) * 100;
  }
  
  return this.save();
};

// ✅ Method 4: Get partner type label
partnerSchema.methods.getPartnerTypeLabel = function() {
  return this.partnerCategory === 'company' ? 'Company Partner' : 'Individual Partner';
};

const Partner = mongoose.models.Partner || mongoose.model('Partner', partnerSchema);
module.exports = Partner;