import mongoose from 'mongoose';

// ══════════════════════════════════════════════════════════════════
// CUSTOMER BASIC INFO
// PRD 4.3 — fullName + mobileNumber ONLY required at lead stage
// Everything else filled by Advisor during enrichment (PRD 6.1)
// ══════════════════════════════════════════════════════════════════
const customerBasicSchema = new mongoose.Schema(
  {
    fullName:           { type: String, required: true, trim: true },
    mobileNumber:       { type: String, required: true, trim: true },
    email:              { type: String, lowercase: true, trim: true, default: null },
    gender:             { type: String, enum: ['Male', 'Female', 'Other'], default: null },
    preferredName:      { type: String, default: null },
    alternativePhone:   { type: String, default: null },
    whatsappNumber:     { type: String, default: null },
    dateOfBirth:        { type: Date,   default: null },
    nationality:        { type: String, default: null },
    residencyStatus:    { type: String, enum: ['UAE National', 'UAE Resident', 'Non-Resident'], default: null },
    maritalStatus:      { type: String, enum: ['Single', 'Married', 'Divorced', 'Widowed'], default: null },
    numberOfDependents: { type: Number, default: 0 },
    occupation:         { type: String, default: null },
    employer:           { type: String, default: null },
    monthlySalary:      { type: Number, default: null },
    employmentStatus:   { type: String, enum: ['Salaried', 'Self-Employed'], default: null },
  },
  { _id: false }
);

// ══════════════════════════════════════════════════════════════════
// PROPERTY DETAILS — optional at lead stage (PRD 5.3)
// ══════════════════════════════════════════════════════════════════
const propertyDetailsSchema = new mongoose.Schema(
  {
    propertyType:       { type: String, enum: ['Ready', 'Off-plan', 'Commercial'], default: null },
    propertySubtype:    { type: String, enum: ['Apartment', 'Villa', 'Townhouse', 'Penthouse'], default: null },
    propertyValue:      { type: Number, default: null },
    downPaymentAmount:  { type: Number, default: null },
    loanAmountRequired: { type: Number, default: null },
    propertyAddress: {
      building: { type: String, default: null },
      area:     { type: String, default: null },
      city:     { type: String, default: 'Dubai' },
    },
    isOffPlan:      { type: Boolean, default: false },
    completionDate: { type: Date,    default: null },
  },
  { _id: false }
);

// ══════════════════════════════════════════════════════════════════
// LOAN REQUIREMENTS
// ══════════════════════════════════════════════════════════════════
const loanRequirementsSchema = new mongoose.Schema(
  {
    preferredTenureYears:        { type: Number,  default: 25 },
    preferredInterestRateType:   { type: String,  enum: ['Fixed', 'Variable'], default: 'Fixed' },
    preferredBanks:              [{ type: String }],
    feeFinancingPreference:      { type: Boolean, default: true },
    lifeInsurancePreference:     { type: Boolean, default: true },
    propertyInsurancePreference: { type: Boolean, default: true },
    specialRequirements:         { type: String,  default: null },
  },
  { _id: false }
);

// ══════════════════════════════════════════════════════════════════
// ELIGIBILITY — filled by Advisor via calculate-eligibility API
// ══════════════════════════════════════════════════════════════════
const eligibilitySchema = new mongoose.Schema(
  {
    checked: { type: Boolean, default: false },
    latestEligibilityCheckId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeadEligibilityCheck',
      default: null,
    },
    isEligible:            { type: Boolean, default: false },
    checkedAt:             { type: Date,    default: null },
    checkedBy:             { type: mongoose.Schema.Types.ObjectId, ref: 'VaultAdvisor', default: null },
    eligibilityScore:      { type: Number,  default: 0 },
    riskGrade:             { type: String,  enum: ['Excellent', 'Good', 'Average', 'Risky'], default: 'Good' },
    dbrPercentage:         { type: Number,  default: 0 },
    dbrStatus:             { type: String,  enum: ['Eligible', 'Borderline', 'Ineligible'], default: 'Eligible' },
    estimatedLTV:          { type: Number,  default: 0 },
    recommendedLoanAmount: { type: Number,  default: 0 },
    eligibilityNotes:      { type: String,  default: null },
  },
  { _id: false }
);

// ══════════════════════════════════════════════════════════════════
// DUPLICATE CHECK
// ══════════════════════════════════════════════════════════════════
const duplicateCheckSchema = new mongoose.Schema(
  {
    isDuplicate:        { type: Boolean, default: false },
    checkPerformedAt:   { type: Date,    default: Date.now },
    matchingPhoneFound: { type: Boolean, default: false },
    lookbackDays:       { type: Number,  default: 180 },
  },
  { _id: false }
);

// ══════════════════════════════════════════════════════════════════
// MAIN LEAD SCHEMA
// ══════════════════════════════════════════════════════════════════
const leadSchema = new mongoose.Schema(
  {
    sourceInfo: {
      source: {
        type: String,
        enum: ['freelance_agent', 'partner_affiliated_agent', 'individual_partner', 'website', 'admin'],
        required: true,
      },
      createdByRole: {
        type: String,
        enum: ['freelance_agent', 'partner_affiliated_agent', 'individual_partner', 'website', 'admin'],
        required: true,
      },
      createdById:    { type: mongoose.Schema.Types.ObjectId, refPath: 'sourceInfo.createdByModel', default: null },
      createdByModel: { type: String, enum: ['VaultAgent', 'Partner', 'Admin'], default: null },
      createdByName:  { type: String, required: true },
      createdAt:      { type: Date,   default: Date.now },
      submissionMethod: {
        type: String,
        enum: ['manual_entry', 'contacts_import', 'website_form', 'bulk_upload', 'api'],
        default: 'manual_entry',
      },
      sourceIp:  { type: String, default: null },
      userAgent: { type: String, default: null },
    },

    customerInfo: { type: customerBasicSchema, required: true },
    customerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },

    propertyDetails:  { type: propertyDetailsSchema,  default: () => ({}) },
    loanRequirements: { type: loanRequirementsSchema, default: () => ({}) },
    eligibility:      { type: eligibilitySchema,      default: () => ({}) },

    currentStatus: {
      type: String,
      enum: [
        'New',
        'Assigned',
        'Contacted',
        'Qualified',
        'Collecting Documents',
        'Documents Complete',
        'Application Opened',
        'Not Proceeding',
      ],
      default: 'New',
    },

    notesToXoto: { type: String, default: null },

    assignedTo: {
      advisorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'VaultAdvisor', default: null },
      advisorName: { type: String, default: null },
      assignedAt:  { type: Date,   default: null },
      assignedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    },

    sla: {
      deadline:           { type: Date,    default: null },
      breached:           { type: Boolean, default: false },
      breachedAt:         { type: Date,    default: null },
      firstContactAt:     { type: Date,    default: null },
      qualificationAt:    { type: Date,    default: null },
      responseTimeHours:  { type: Number,  default: null },
      timeToQualifyHours: { type: Number,  default: null },
      reminderCount:      { type: Number,  default: 0 },
      lastReminderSentAt: { type: Date,    default: null },
    },

    documentCollection: {
      collectionStartedAt:    { type: Date,    default: null },
      collectionCompletedAt:  { type: Date,    default: null },
      totalDocumentsRequired: { type: Number,  default: 7 },
      documentsUploaded:      { type: Number,  default: 0 },
      documentsPending:       { type: Number,  default: 7 },
      documentsVerified:      { type: Number,  default: 0 },
      documentsRejected:      { type: Number,  default: 0 },
      collectionPercentage:   { type: Number,  default: 0 },
      readyForSubmission:     { type: Boolean, default: false },
    },

    duplicateCheck:  { type: duplicateCheckSchema, default: () => ({}) },

    conversionInfo: {
      convertedToApplication: { type: Boolean, default: false },
      applicationId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Case',     default: null },
      proposalId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Proposal', default: null },
      convertedAt:     { type: Date,   default: null },
      convertedByRole: { type: String, default: null },
      convertedById:   { type: mongoose.Schema.Types.ObjectId, default: null },
      convertedByName: { type: String, default: null },
    },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date,    default: null },
  },
  { timestamps: true }
);

// ══════════════════════════════════════════════════════════════════
// INDEXES
// ══════════════════════════════════════════════════════════════════
leadSchema.index({ 'customerInfo.mobileNumber': 1 });
leadSchema.index({ 'sourceInfo.createdById': 1 });
leadSchema.index({ 'sourceInfo.source': 1 });
leadSchema.index({ currentStatus: 1 });
leadSchema.index({ 'assignedTo.advisorId': 1 });
leadSchema.index({ 'sla.deadline': 1 });
leadSchema.index({ 'sla.breached': 1 });
leadSchema.index({ createdAt: -1 });
leadSchema.index({ isDeleted: 1 });

// ══════════════════════════════════════════════════════════════════
// VIRTUALS
// ══════════════════════════════════════════════════════════════════
leadSchema.virtual('customerAge').get(function () {
  if (!this.customerInfo?.dateOfBirth) return null;
  return Math.floor(
    (Date.now() - new Date(this.customerInfo.dateOfBirth)) / (365.25 * 24 * 3600 * 1000)
  );
});

// ══════════════════════════════════════════════════════════════════
// METHODS
// ══════════════════════════════════════════════════════════════════
leadSchema.methods.updateDocumentStatus = function (uploaded, verified) {
  const total = this.documentCollection.totalDocumentsRequired || 7;
  const up    = Math.min(uploaded, total);
  const ver   = Math.min(verified, total);
  this.documentCollection.documentsUploaded    = up;
  this.documentCollection.documentsVerified    = ver;
  this.documentCollection.documentsPending     = Math.max(0, total - up);
  this.documentCollection.collectionPercentage = Math.min(100, Math.round((up / total) * 100));
  this.documentCollection.readyForSubmission   = up === total;
  if (this.documentCollection.collectionPercentage === 100 && !this.documentCollection.collectionCompletedAt) {
    this.documentCollection.collectionCompletedAt = new Date();
  }
  return this.save();
};

leadSchema.set('toJSON',   { virtuals: true });
leadSchema.set('toObject', { virtuals: true });

const VaultLead = mongoose.models.VaultLead || mongoose.model('VaultLead', leadSchema);
export default VaultLead;