import mongoose from 'mongoose';

// ══════════════════════════════════════════════════════════════════
// CUSTOMER BASIC INFO
// Required: firstName + lastName + mobileNumber
// Everything else optional at lead stage (PRD 6.1)
// ══════════════════════════════════════════════════════════════════
const customerBasicSchema = new mongoose.Schema(
  {
    // ── Required ──────────────────────────────────────────────────
    firstName:    { type: String, required: true, trim: true },
    lastName:     { type: String, required: true, trim: true },
    countryCode:  { type: String, default: '+971', trim: true },
    mobileNumber: { type: String, required: true, trim: true },

    // ── Optional — filled by Advisor after contact ────────────────
    email:              { type: String, lowercase: true, trim: true, default: null },
    gender:             { type: String, enum: ['Male', 'Female', 'Other'], default: null },
    preferredName:      { type: String, default: null },
    alternativePhone:   { type: String, default: null },
    whatsappNumber:     { type: String, default: null },
    dateOfBirth:        { type: Date,   default: null },

    // nationality: auto = "UAE" if UAE National, manual otherwise
    nationality:        { type: String, default: null },
    residencyStatus:    { type: String, enum: ['UAE National', 'UAE Resident', 'Non-Resident'], default: null },
    maritalStatus:      { type: String, enum: ['Single', 'Married', 'Divorced', 'Widowed'], default: null },
    numberOfDependents: { type: Number, default: 0 },
    occupation:                  { type: String, default: null },
    employer:                    { type: String, default: null },
    monthlySalary:               { type: Number, default: null },
    salaryBankName:              { type: String, default: null },
    existingLiabilities:         { type: Number, default: null },
    employmentStatus:            { type: String, enum: ['Salaried', 'Self-Employed'], default: null },
  },
  { _id: false }
);

// ══════════════════════════════════════════════════════════════════
// PROPERTY DETAILS — optional at lead stage (PRD 5.3)
// ══════════════════════════════════════════════════════════════════
const propertyDetailsSchema = new mongoose.Schema(
  {
    // ── From ticket ───────────────────────────────────────────────
    transactionType: {
      type: String,
      enum: [
        'Primary - Residential',
        'Primary - Commercial',
        'Buyout',
        'Equity',
        'Buyout + Equity',
        'Off-plan',
      ],
      default: null,
    },
    propertyFound:       { type: Boolean, default: null },
    approxPropertyValue: {
      type:    String,
      enum:    ['<1M', '1-2M', '2-5M', '5-10M', '10M+'],
      default: null,
    },

    // ── Existing ──────────────────────────────────────────────────
    propertyType: {
      type:    String,
      enum:    ['Ready', 'Off-plan', 'Commercial'],
      default: null,
    },
    propertySubtype: {
      type:    String,
      enum:    ['Apartment', 'Villa', 'Townhouse', 'Penthouse'],
      default: null,
    },
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
    // ── From ticket ───────────────────────────────────────────────
    timeline: {
      type:    String,
      enum:    ['Immediately', '1-3 months', '3-6 months', 'More than 6 months'],
      default: null,
    },

    // ── Existing ──────────────────────────────────────────────────
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
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'LeadEligibilityCheck',
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
    // ── Source ───────────────────────────────────────────────────
    sourceInfo: {
      source: {
        type: String,
        enum: ['referral_partner', 'partner_affiliated_agent', 'individual_partner', 'website', 'admin'],
        required: true,
      },
      createdByRole: {
        type: String,
        enum: ['referral_partner', 'partner_affiliated_agent', 'individual_partner', 'website', 'admin'],
        required: true,
      },
      createdById:    { type: mongoose.Schema.Types.ObjectId, refPath: 'sourceInfo.createdByModel', default: null },
      createdByModel: { type: String, enum: ['VaultAgent', 'Partner', 'Admin', 'GridReferralPartner'], default: null },
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

    // ── Customer ─────────────────────────────────────────────────
    customerInfo: { type: customerBasicSchema, required: true },
    customerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },

    // ── Property & Loan (optional at lead stage) ─────────────────
    propertyDetails:  { type: propertyDetailsSchema,  default: () => ({}) },
    loanRequirements: { type: loanRequirementsSchema, default: () => ({}) },

    // ── Eligibility ──────────────────────────────────────────────
    eligibility: { type: eligibilitySchema, default: () => ({}) },

    // ── Lead Status ──────────────────────────────────────────────
    // PRD 6.1 — Advisor workflow
    currentStatus: {
      type: String,
      enum: [
       // Initial
  'New',
  
  // Advisor Workflow
  'Assigned',
  'Contacted',
  'Qualified',
  
  // Document Collection
  'Collecting Documents',
  'Documents Complete',
  
  // Application
  'Application Opened',
  
  // Bank Stages
  'Bank Application',
  'Pre-Approved',
  'Valuation',
  'FOL Processed',
  'FOL Issued',
  'FOL Signed',
  
  // Final
  'Disbursed',
  'Lost',
  'Not Proceeding',      // Closed / Not Proceeding
      ],
      default: 'New',
    },

    notesToXoto:         { type: String, default: null },
    notProceedingReason: { type: String, default: null },

    // ── Active flag — false when Not Proceeding, Lost, or linked to closed case ──
    isActive: { type: Boolean, default: true },

    // ── Assignment (Admin → Advisor) ─────────────────────────────
    assignedTo: {
      advisorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'VaultAdvisor', default: null },
      advisorName: { type: String, default: null },
      assignedAt:  { type: Date,   default: null },
      assignedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    },

    // ── SLA — 4 business hours from assignment ───────────────────
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

    // ── Duplicate check ──────────────────────────────────────────
    duplicateCheck: { type: duplicateCheckSchema, default: () => ({}) },

    // ── Conversion to Case/Application ───────────────────────────
    conversionInfo: {
      convertedToApplication: { type: Boolean, default: false },
      applicationId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Case',     default: null },
      proposalId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Proposal', default: null },
      convertedAt:     { type: Date,   default: null },
      convertedByRole: { type: String, default: null },
      convertedById:   { type: mongoose.Schema.Types.ObjectId, default: null },
      convertedByName: { type: String, default: null },
    },

    // ── Reassignment history ─────────────────────────────────────
    reassignmentHistory: [
      {
        advisorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'VaultAdvisor' },
        advisorName:  { type: String, default: null },
        reassignedAt: { type: Date,   default: Date.now },
        reason:       { type: String, default: null },
        reassignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
      },
    ],

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date,    default: null },
  },
  { timestamps: true }
);

// ══════════════════════════════════════════════════════════════════
// INDEXES
// ══════════════════════════════════════════════════════════════════
leadSchema.index({ 'customerInfo.mobileNumber': 1 });
leadSchema.index({ isActive: 1 });
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

// fullName = firstName + lastName
leadSchema.virtual('customerInfo.fullName').get(function () {
  const f = this.customerInfo?.firstName || '';
  const l = this.customerInfo?.lastName  || '';
  return `${f} ${l}`.trim();
});

// Full phone = countryCode + mobileNumber
leadSchema.virtual('customerFullPhone').get(function () {
  const code   = this.customerInfo?.countryCode  || '+971';
  const number = this.customerInfo?.mobileNumber || '';
  return `${code}${number}`;
});

// Customer age from DOB
leadSchema.virtual('customerAge').get(function () {
  if (!this.customerInfo?.dateOfBirth) return null;
  return Math.floor(
    (Date.now() - new Date(this.customerInfo.dateOfBirth)) / (365.25 * 24 * 3600 * 1000)
  );
});

leadSchema.set('toJSON',   { virtuals: true });
leadSchema.set('toObject', { virtuals: true });

const VaultLead = mongoose.models.VaultLead || mongoose.model('VaultLead', leadSchema);
export default VaultLead;