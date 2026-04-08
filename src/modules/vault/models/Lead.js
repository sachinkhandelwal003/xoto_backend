const mongoose = require('mongoose');

const customerBasicSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    preferredName: { type: String, default: null },
    email: { type: String, required: true, lowercase: true },
    mobileNumber: { type: String, required: true },
    alternativePhone: { type: String, default: null },
    whatsappNumber: { type: String, default: null },
    dateOfBirth: { type: Date, required: true },
    nationality: { type: String, required: true },
    maritalStatus: {
      type: String,
      enum: ['Single', 'Married', 'Divorced', 'Widowed'],
      required: true,
    },
    numberOfDependents: { type: Number, default: 0 },
    occupation: { type: String, default: null },
    employer: { type: String, default: null },
    monthlySalary: { type: Number, default: null },
  },
  { _id: false }
);

const propertyDetailsSchema = new mongoose.Schema(
  {
    propertyType: { type: String, enum: ['Ready', 'Off-plan', 'Commercial'], required: true },
    propertySubtype: { type: String, enum: ['Apartment', 'Villa', 'Townhouse', 'Penthouse'], default: null },
    propertyValue: { type: Number, required: true },
    downPaymentAmount: { type: Number, default: null },
    loanAmountRequired: { type: Number, default: null },
    propertyAddress: {
      building: { type: String, default: null },
      area: { type: String, default: null },
      city: { type: String, default: 'Dubai' },
    },
    propertyAgeYears: { type: Number, default: null },
    isOffPlan: { type: Boolean, default: false },
    completionDate: { type: Date, default: null },
  },
  { _id: false }
);

const loanRequirementsSchema = new mongoose.Schema(
  {
    preferredTenureYears: { type: Number, default: 25 },
    preferredInterestRateType: { type: String, enum: ['Fixed', 'Variable'], default: 'Fixed' },
    preferredBanks: [{ type: String }],
    feeFinancingPreference: { type: Boolean, default: true },
    lifeInsurancePreference: { type: Boolean, default: true },
    propertyInsurancePreference: { type: Boolean, default: true },
    specialRequirements: { type: String, default: null },
  },
  { _id: false }
);

const duplicateCheckSchema = new mongoose.Schema(
  {
    isDuplicate: { type: Boolean, default: false },
    checkedAgainstLeads: [{ type: String }],
    lookbackDays: { type: Number, default: 180 },
    checkPerformedAt: { type: Date, default: Date.now },
    matchingPhoneFound: { type: Boolean, default: false },
  },
  { _id: false }
);

const commissionInfoSchema = new mongoose.Schema(
  {
    commissionEligible: { type: Boolean, default: false },
    commissionAmount: { type: Number, default: null },
    commissionStatus: { type: String, enum: ['Pending', 'Confirmed', 'Paid'], default: 'Pending' },
    expectedPaymentDate: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    calculation: {
      bankCommissionToXoto: { type: Number, default: null },
      agentPercentage: { type: Number, default: null },
      formula: { type: String, default: null },
    },
  },
  { _id: false }
);

const leadSchema = new mongoose.Schema(
  {
    leadId: { type: String, unique: true, required: true },
    
    sourceInfo: {
      createdByRole: { type: String, enum: ['freelance_agent', 'partner_affiliated_agent'], required: true },
      createdById: { type: mongoose.Schema.Types.ObjectId, ref: 'VaultAgent', required: true },
      createdByName: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
      submissionMethod: { type: String, enum: ['manual_entry', 'contacts_import'], default: 'manual_entry' },
      sourceIp: { type: String, default: null },
    },

    customerInfo: { type: customerBasicSchema, required: true },

    propertyDetails: { type: propertyDetailsSchema, required: true },

    loanRequirements: { type: loanRequirementsSchema, default: () => ({}) },

    referralType: {
      type: String,
      enum: ['Referral Only', 'Referral + Docs'],
      required: true,
    },
    commissionTier: { type: Number, default: null },
    loanAmountRange: { type: String, enum: ['≤5M AED', '>5M AED'], default: null },
    expectedCommission: { type: Number, default: null },
    notesToXoto: { type: String, default: null },

    currentStatus: {
      type: String,
      enum: ['New', 'Contacted', 'Qualified', 'Collecting Documentation', 'Disbursed'],
      default: 'New',
    },

    duplicateCheck: { type: duplicateCheckSchema, default: () => ({}) },

    documentCollection: {
      collectionMethod: { type: String, enum: ['agent_collected', 'xoto_collected'], default: null },
      assignedToAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'VaultAgent', default: null },
      collectionStartedAt: { type: Date, default: null },
      collectionCompletedAt: { type: Date, default: null },
      totalDocumentsRequired: { type: Number, default: 7 },
      documentsUploaded: { type: Number, default: 0 },
      documentsVerified: { type: Number, default: 0 },
      documentsPending: { type: Number, default: 7 },
      documentsRejected: { type: Number, default: 0 },
      collectionPercentage: { type: Number, default: 0 },
      verificationPercentage: { type: Number, default: 0 },
      readyForSubmission: { type: Boolean, default: false },
    },

    conversionInfo: {
      convertedToCase: { type: Boolean, default: false },
      caseId: { type: String, default: null },
      convertedAt: { type: Date, default: null },
      convertedByRole: { type: String, default: null },
      convertedById: { type: mongoose.Schema.Types.ObjectId, default: null },
      convertedByName: { type: String, default: null },
    },

    commissionInfo: { type: commissionInfoSchema, default: () => ({}) },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Indexes
leadSchema.index({ leadId: 1 }, { unique: true });
leadSchema.index({ 'sourceInfo.createdById': 1 });
leadSchema.index({ 'customerInfo.mobileNumber': 1 });
leadSchema.index({ currentStatus: 1 });
leadSchema.index({ referralType: 1 });
leadSchema.index({ createdAt: -1 });

// Virtuals
leadSchema.virtual('customerAge').get(function () {
  if (!this.customerInfo.dateOfBirth) return null;
  const ageDiff = Date.now() - this.customerInfo.dateOfBirth.getTime();
  const ageDate = new Date(ageDiff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
});

// Methods
leadSchema.methods.updateDocumentStatus = function (uploadedCount, verifiedCount) {
  this.documentCollection.documentsUploaded = uploadedCount;
  this.documentCollection.documentsVerified = verifiedCount;
  this.documentCollection.documentsPending = this.documentCollection.totalDocumentsRequired - uploadedCount;
  this.documentCollection.collectionPercentage = Math.round((uploadedCount / this.documentCollection.totalDocumentsRequired) * 100);
  this.documentCollection.verificationPercentage = Math.round((verifiedCount / this.documentCollection.totalDocumentsRequired) * 100);
  this.documentCollection.readyForSubmission = this.documentCollection.collectionPercentage === 100;
  
  if (this.documentCollection.collectionPercentage === 100 && !this.documentCollection.collectionCompletedAt) {
    this.documentCollection.collectionCompletedAt = new Date();
  }
  
  return this.save();
};

const Lead = mongoose.models.Lead || mongoose.model('VaultLead', leadSchema);
module.exports = Lead;