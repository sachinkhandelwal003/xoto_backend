const mongoose = require('mongoose');

const bankDetailsSchema = new mongoose.Schema(
  {
    beneficiaryName: { type: String, default: null },
    bankName: { type: String, default: null },
    accountNumber: { type: String, default: null },
    iban: { type: String, default: null },
    swiftCode: { type: String, default: null },
    branchName: { type: String, default: null },
    accountType: { type: String, enum: ['Business Current', 'Business Savings', null], default: null },
    verified: { type: Boolean, default: false },
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
    countryCode: { type: String, required: true }, // e.g. +91, +971
    phone: { type: String, required: true },
    alternativePhone: { type: String, default: null },
    whatsappNumber: { type: String, default: null },
    emiratesId: { type: String, default: null },
  },
  { _id: false }
);

const commissionTierSchema = new mongoose.Schema(
  {
    tier1: {
      loanAmountMax: { type: Number, default: 5000000 },
      commissionPercentage: { type: Number, default: 75 },
      description: { type: String, default: 'For loans up to 5M AED' },
    },
    tier2: {
      loanAmountMin: { type: Number, default: 5000001 },
      commissionPercentage: { type: Number, default: 80 },
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

const partnerSchema = new mongoose.Schema(
  {
    // Basic Information
    companyName: { type: String, required: true, unique: true, trim: true },
    legalEntityType: {
      type: String,
      enum: ['LLC', 'Sole Proprietorship', 'Branch Office', 'Free Zone Company'],
      required: true,
    },
    tradeLicenseNumber: { type: String, required: true, unique: true },
    tradeLicenseIssueDate: { type: Date, required: true },
        isOffline_aggrement: { type: Date, required: true },
    tradeLicenseExpiryDate: { type: Date, required: true },
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

    // Commission Configuration
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
partnerSchema.index({ companyName: 1 });
partnerSchema.index({ tradeLicenseNumber: 1 });
partnerSchema.index({ status: 1 });
partnerSchema.index({ isDeleted: 1 });

// Virtual for full company name
partnerSchema.virtual('fullCompanyName').get(function () {
  return this.dbaName ? `${this.companyName} (${this.dbaName})` : this.companyName;
});

// Method to check if partner is active
partnerSchema.methods.isActive = function () {
  return this.status === 'active' && !this.isDeleted;
};

// Method to get commission percentage based on loan amount
partnerSchema.methods.getCommissionPercentage = function (loanAmount) {
  if (loanAmount <= this.commissionConfiguration.tier1.loanAmountMax) {
    return this.commissionConfiguration.tier1.commissionPercentage;
  }
  return this.commissionConfiguration.tier2.commissionPercentage;
};

const Partner = mongoose.models.Partner || mongoose.model('Partner', partnerSchema);
module.exports = Partner;