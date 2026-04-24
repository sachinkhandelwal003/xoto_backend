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
    
  sourceInfo: {
  source: { 
    type: String, 
    enum: ['freelance_agent', 'partner_affiliated_agent', 'individual_partner', 'website', 'admin'], 
    default: 'freelance_agent'
  },
  createdByRole: { 
    type: String,
    enum: ['freelance_agent', 'partner_affiliated_agent', 'individual_partner', 'website', 'admin'], 
    required: true 
  },
  createdById: { type: mongoose.Schema.Types.ObjectId, refPath: 'sourceInfo.createdByModel', default: null },
  createdByModel: { 
    type: String, 
    enum: ['VaultAgent', 'Partner', 'Admin'], 
    default: null 
  },
  createdByName: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  submissionMethod: { type: String, enum: ['manual_entry', 'contacts_import', 'website_form', 'api'], default: 'manual_entry' },
  sourceIp: { type: String, default: null },
  userAgent: { type: String, default: null },
},

    customerInfo: { type: customerBasicSchema, required: true },
  customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
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
      enum: ['New', 'Assigned', 'Contacted', 'Qualified', 'Collecting Documents', 'Application Created', 'Not Proceeding', 'Disbursed'],
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
 assignedTo: {
      advisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'VaultAdvisor', default: null },
      advisorName: { type: String, default: null },
      assignedAt: { type: Date, default: null },
      assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
    },
     sla: {
      deadline: { type: Date, default: null },
      breached: { type: Boolean, default: false },
      breachedAt: { type: Date, default: null },
      firstContactAt: { type: Date, default: null },
      qualificationAt: { type: Date, default: null },
      reminderCount: { type: Number, default: 0 },
      lastReminderSentAt: { type: Date, default: null }
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
leadSchema.index({ 'sourceInfo.createdById': 1 });
leadSchema.index({ 'customerInfo.mobileNumber': 1 });
leadSchema.index({ currentStatus: 1 });
leadSchema.index({ referralType: 1 });
leadSchema.index({ createdAt: -1 });
leadSchema.index({ 'assignedTo.advisorId': 1 });  // ✅ ADD THIS
leadSchema.index({ 'sla.deadline': 1 });          // ✅ ADD THIS
leadSchema.index({ 'sla.breached': 1 });          

// Virtualsylkjh
leadSchema.virtual('customerAge').get(function () {
  if (!this.customerInfo.dateOfBirth) return null;
  const ageDiff = Date.now() - this.customerInfo.dateOfBirth.getTime();
  const ageDate = new Date(ageDiff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
});

// Methods
// In models/VaultLead.js
leadSchema.methods.updateDocumentStatus = function (uploadedCount, verifiedCount) {
  const totalRequired = this.documentCollection.totalDocumentsRequired || 7;
  
  // ✅ Ensure counts don't exceed total required
  const safeUploadedCount = Math.min(uploadedCount, totalRequired);
  const safeVerifiedCount = Math.min(verifiedCount, totalRequired);
  
  this.documentCollection.documentsUploaded = safeUploadedCount;
  this.documentCollection.documentsVerified = safeVerifiedCount;
  this.documentCollection.documentsPending = Math.max(0, totalRequired - safeUploadedCount);
  this.documentCollection.documentsRejected = 0;
  this.documentCollection.collectionPercentage = Math.min(100, Math.round((safeUploadedCount / totalRequired) * 100));
  this.documentCollection.verificationPercentage = Math.min(100, Math.round((safeVerifiedCount / totalRequired) * 100));
  this.documentCollection.readyForSubmission = safeUploadedCount === totalRequired;
  
  if (this.documentCollection.collectionPercentage === 100 && !this.documentCollection.collectionCompletedAt) {
    this.documentCollection.collectionCompletedAt = new Date();
  }
  
  return this.save();
};

const VaultLead = mongoose.model('VaultLead', leadSchema);
module.exports = VaultLead;