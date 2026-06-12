import mongoose from 'mongoose';

// ══════════════════════════════════════════════════════════════════
// PROPOSAL MODEL — PRD Rules
//
//  ✅ Created from Qualified lead only
//  ✅ Advisor OR Partner can create
//  ✅ Up to 3 banks selected — EMI/DBR/LTV snapshot per bank
//  ✅ PDF generated and sent to customer email (attachment)
//  ✅ No secure link / no web portal for customer
//  ✅ Customer reviews PDF → tells advisor preference by phone/message
//  ✅ Advisor records customer bank preference manually
//  ✅ NO link to Case — proposal is a standalone presentation tool
//  ✅ ES Module
// ══════════════════════════════════════════════════════════════════

// ── Customer financial snapshot ───────────────────────────────────
const customerSnapshotSchema = new mongoose.Schema({
  fullName:           { type: String, default: null },
  email:              { type: String, default: null },
  mobile:             { type: String, default: null },
  nationality:        { type: String, default: null },
  residencyStatus:    { type: String, default: null },
  employmentStatus:   { type: String, default: null },
  monthlySalary:      { type: Number, default: null },
  totalMonthlyIncome: { type: Number, default: null },
  totalMonthlyDebt:   { type: Number, default: null },
  dateOfBirth:        { type: Date,   default: null },
}, { _id: false });

// ── Property snapshot ─────────────────────────────────────────────
const propertySnapshotSchema = new mongoose.Schema({
  propertyValue:      { type: Number, default: null },
  downPaymentAmount:  { type: Number, default: null },
  loanAmountRequired: { type: Number, default: null },
  ltvPercentage:      { type: Number, default: null },
  tenureYears:        { type: Number, default: 25 },
  propertyType:       { type: String, default: null },
  transactionType:    { type: String, default: null },
  propertyAddress: {
    area: { type: String, default: null },
    city: { type: String, default: 'Dubai' },
  },
}, { _id: false });

// ── DBR breakdown per bank ────────────────────────────────────────
const dbrBreakdownSchema = new mongoose.Schema({
  monthlyEMI:              { type: Number, default: 0 },
  existingMonthlyDebt:     { type: Number, default: 0 },
  totalMonthlyObligations: { type: Number, default: 0 },
  totalMonthlyIncome:      { type: Number, default: 0 },
  dbrPercentage:           { type: Number, default: 0 },
  dbrStatus:               { type: String, enum: ['Eligible', 'Borderline', 'Ineligible'], default: 'Eligible' },
  maxAllowedDBR:           { type: Number, default: 50 },
}, { _id: false });

// ── Selected bank (max 3) — full snapshot at proposal time ────────
const selectedBankSchema = new mongoose.Schema({
  bankId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Bank', required: true },
  bankName:    { type: String, required: true },
  bankLogo:    { type: String, default: null },
  productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'BankMortgageProducts', required: true },
  productName: { type: String, required: true },
  mortgageType:{ type: String, default: null },

  // Rate
  snapshotRate:         { type: Number, required: true },
  snapshotRateType:     { type: String, default: null },
  snapshotFollowOnRate: { type: String, default: null },

  // Calculated
  snapshotEMI: { type: Number, required: true },
  snapshotLTV: { type: Number, default: null },
  maxLTV:      { type: Number, default: null },

  // DBR per bank
  dbrBreakdown: { type: dbrBreakdownSchema, default: () => ({}) },

  // Fees
  snapshotProcessingFee:  { type: Number, default: 0 },
  snapshotValuationFee:   { type: Number, default: 0 },
  snapshotPreApprovalFee: { type: Number, default: 0 },
  snapshotBuyoutFee:      { type: Number, default: 0 },
  isBuyoutFeeNA:          { type: Boolean, default: false },

  // Insurance
  lifeInsurance:     { value: { type: Number, default: 0 }, frequency: { type: String, default: 'pa' } },
  propertyInsurance: { value: { type: Number, default: 0 }, frequency: { type: String, default: 'pa' } },

  // Eligibility
  isEligible:       { type: Boolean, default: true },
  eligibilityNotes: { type: String,  default: null },
  isRecommended:    { type: Boolean, default: false },

  salaryTransferRequired: { type: Boolean, default: false },
  keyFeatures: [{ type: String }],
}, { _id: false });

// ── Bank comparison summary ───────────────────────────────────────
const bankComparisonSchema = new mongoose.Schema({
  bestRateBank:    { type: String, default: null },
  bestRate:        { type: Number, default: null },
  lowestEMIBank:   { type: String, default: null },
  lowestEMI:       { type: Number, default: null },
  lowestFeesBank:  { type: String, default: null },
  recommendedBank: { type: String, default: null },
}, { _id: false });

// ── PDF tracking ──────────────────────────────────────────────────
const pdfTrackingSchema = new mongoose.Schema({
  pdfUrl:         { type: String, default: null },
  pdfGeneratedAt: { type: Date,   default: null },
  sentToEmail:    { type: String, default: null },
  sentAt:         { type: Date,   default: null },
  sentBy: {
    userId:   { type: mongoose.Schema.Types.ObjectId, default: null },
    userName: { type: String, default: null },
  },
  resendCount:  { type: Number, default: 0 },
  lastResentAt: { type: Date,   default: null },
}, { _id: false });

// ── Customer preference ───────────────────────────────────────────
// Advisor records manually after customer reviews PDF and gives feedback
const customerPreferenceSchema = new mongoose.Schema({
  preferredBankId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Bank', default: null },
  preferredBankName:  { type: String, default: null },
  preferredProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankMortgageProducts', default: null },
  feedbackNote:       { type: String, default: null },
  recordedAt:         { type: Date,   default: null },
  recordedBy: {
    userId:   { type: mongoose.Schema.Types.ObjectId, default: null },
    userName: { type: String, default: null },
  },
}, { _id: false });

// ══════════════════════════════════════════════════════════════════
// MAIN PROPOSAL SCHEMA
// ══════════════════════════════════════════════════════════════════
const proposalSchema = new mongoose.Schema({

  // ── Reference ────────────────────────────────────────────────
  proposalReference: { type: String, unique: true, required: true },
  // e.g. PROP-2026-0041

  // ── Lead — must be Qualified ──────────────────────────────────
  leadId:     { type: mongoose.Schema.Types.ObjectId, ref: 'VaultLead', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer',  default: null },

  // ── Who created ───────────────────────────────────────────────
  // Advisor OR Partner can create proposals
  createdBy: {
    role:     { type: String, enum: ['advisor', 'partner', 'admin'], required: true },
    userId:   { type: mongoose.Schema.Types.ObjectId, required: true },
    userName: { type: String, required: true },
  },

  // ── Snapshots — historical record ────────────────────────────
  customerSnapshot: { type: customerSnapshotSchema,  default: () => ({}) },
  propertySnapshot: { type: propertySnapshotSchema,  default: () => ({}) },

  // ── Selected banks — max 3 per PRD ───────────────────────────
  selectedBanks: {
    type:     [selectedBankSchema],
    validate: {
      validator: function (v) { return v.length >= 1 && v.length <= 3; },
      message:   'Proposal must have between 1 and 3 banks',
    },
  },

  // ── Comparison summary — auto-built on save ──────────────────
  bankComparison: { type: bankComparisonSchema, default: () => ({}) },

  // ── PDF ───────────────────────────────────────────────────────
  // PDF is generated and attached to email
  // Customer views it in their email — no web link
  pdf: { type: pdfTrackingSchema, default: () => ({}) },

  // ── Customer preference ───────────────────────────────────────
  // Advisor records which bank customer wants after reviewing PDF
  customerPreference: { type: customerPreferenceSchema, default: () => ({}) },

  // ── Notes ─────────────────────────────────────────────────────
  coverNote:     { type: String, default: null },
  internalNotes: { type: String, default: null },

  // ── Status ───────────────────────────────────────────────────
  // Draft    → created, PDF not sent yet
  // Sent     → PDF emailed to customer
  // Accepted → advisor recorded customer's preferred bank
  // Expired  → 30 days passed with no response
  // Rejected → customer decided not to proceed
  status: {
    type:    String,
    enum:    ['Draft', 'Sent', 'Accepted', 'Expired', 'Rejected'],
    default: 'Draft',
  },

  validUntil: { type: Date, default: null }, // 30 days from creation

  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date,    default: null },

}, { timestamps: true });

// ══════════════════════════════════════════════════════════════════
// INDEXES
// ══════════════════════════════════════════════════════════════════
// proposalReference unique index is declared inline in the schema field definition
proposalSchema.index({ leadId: 1 });
proposalSchema.index({ 'createdBy.userId': 1 });
proposalSchema.index({ status: 1 });
proposalSchema.index({ createdAt: -1 });
proposalSchema.index({ isDeleted: 1 });

// ══════════════════════════════════════════════════════════════════
// VIRTUALS
// ══════════════════════════════════════════════════════════════════
proposalSchema.virtual('isExpired').get(function () {
  return this.validUntil ? new Date() > this.validUntil : false;
});
proposalSchema.virtual('bankCount').get(function () {
  return this.selectedBanks?.length || 0;
});
proposalSchema.virtual('hasPDF').get(function () {
  return !!this.pdf?.pdfUrl;
});
proposalSchema.virtual('wasSent').get(function () {
  return !!this.pdf?.sentAt;
});

// ══════════════════════════════════════════════════════════════════
// PRE-SAVE
// ══════════════════════════════════════════════════════════════════
proposalSchema.pre('save', function (next) {
  // Set validUntil 30 days from creation
  if (this.isNew && !this.validUntil) {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    this.validUntil = d;
  }

  // Auto-expire
  if (this.validUntil && new Date() > this.validUntil && this.status === 'Sent') {
    this.status = 'Expired';
  }

  // Auto-build bankComparison from selectedBanks
  if (this.selectedBanks?.length > 0) {
    const banks = this.selectedBanks;
    const best    = banks.reduce((a, b) => a.snapshotRate < b.snapshotRate ? a : b);
    const lowestE = banks.reduce((a, b) => a.snapshotEMI  < b.snapshotEMI  ? a : b);
    const lowestF = banks.reduce((a, b) =>
      (a.snapshotProcessingFee + a.snapshotValuationFee) <
      (b.snapshotProcessingFee + b.snapshotValuationFee) ? a : b
    );
    const recommended = banks.find(b => b.isRecommended);
    this.bankComparison = {
      bestRateBank:    best.bankName,
      bestRate:        best.snapshotRate,
      lowestEMIBank:   lowestE.bankName,
      lowestEMI:       lowestE.snapshotEMI,
      lowestFeesBank:  lowestF.bankName,
      recommendedBank: recommended?.bankName || best.bankName,
    };
  }

  next();
});

// ══════════════════════════════════════════════════════════════════
// INSTANCE METHODS
// ══════════════════════════════════════════════════════════════════

proposalSchema.methods.markAsSent = function (email, pdfUrl, sentBy) {
  this.pdf.pdfUrl      = pdfUrl || this.pdf.pdfUrl;
  this.pdf.sentToEmail = email;
  this.pdf.sentAt      = new Date();
  this.pdf.sentBy      = sentBy || {};
  this.pdf.resendCount = (this.pdf.resendCount || 0) + 1;
  if (this.pdf.resendCount > 1) this.pdf.lastResentAt = new Date();
  this.status = 'Sent';
  return this.save();
};

proposalSchema.methods.recordCustomerPreference = function (bankId, bankName, productId, note, recordedBy) {
  this.customerPreference = {
    preferredBankId:    bankId,
    preferredBankName:  bankName,
    preferredProductId: productId || null,
    feedbackNote:       note || null,
    recordedAt:         new Date(),
    recordedBy:         recordedBy || {},
  };
  this.status = 'Accepted';
  return this.save();
};

proposalSchema.methods.softDelete = function () {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

// ══════════════════════════════════════════════════════════════════
// STATIC METHODS
// ══════════════════════════════════════════════════════════════════

proposalSchema.statics.calculateEMI = function (loanAmount, annualRate, tenureYears) {
  if (!loanAmount || !annualRate || !tenureYears) return 0;
  const r = annualRate / 100 / 12;
  const n = tenureYears * 12;
  return Math.round(loanAmount * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
};

proposalSchema.statics.calculateLTV = function (loanAmount, propertyValue) {
  if (!propertyValue) return 0;
  return parseFloat(((loanAmount / propertyValue) * 100).toFixed(2));
};

proposalSchema.statics.calculateDBR = function (emi, existingDebt, income) {
  if (!income) return 0;
  return parseFloat((((emi + (existingDebt || 0)) / income) * 100).toFixed(2));
};

proposalSchema.statics.getDbrStatus = function (dbr, maxDBR = 50) {
  if (dbr <= maxDBR * 0.85) return 'Eligible';
  if (dbr <= maxDBR)        return 'Borderline';
  return 'Ineligible';
};

proposalSchema.set('toJSON',   { virtuals: true });
proposalSchema.set('toObject', { virtuals: true });

const Proposal = mongoose.models.Proposal || mongoose.model('Proposal', proposalSchema);
export default Proposal;