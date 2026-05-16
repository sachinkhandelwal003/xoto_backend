// models/LeadEligibilityCheck.js
import mongoose from 'mongoose';

// ══════════════════════════════════════════════════════════════════
// PURPOSE
// Stores a record every time an Advisor runs the eligibility check
// on a lead. Useful for history — Advisor may run multiple times
// with different values.
// Actual result snapshot also stored on lead.eligibility (latest only)
// ══════════════════════════════════════════════════════════════════

const leadEligibilityCheckSchema = new mongoose.Schema(
  {
    // ── References ───────────────────────────────────────────────
    leadId:    { type: mongoose.Schema.Types.ObjectId, ref: 'VaultLead',    required: true, index: true },
    checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'VaultAdvisor', required: true },

    // ── Inputs (what Advisor entered) ────────────────────────────
    monthlySalary:       { type: Number, required: true },
    otherIncome:         { type: Number, default: 0 },
    existingLoanEMIs:    { type: Number, default: 0 },
    creditCardPayments:  { type: Number, default: 0 },
    propertyValue:       { type: Number, required: true },
    requestedLoanAmount: { type: Number, required: true },
    tenureYears:         { type: Number, default: 25 },
    nationality:         { type: String, default: null },
    customerAge:         { type: Number, default: null },

    // ── Calculated Results ───────────────────────────────────────
    totalMonthlyIncome:      { type: Number, default: 0 },
    totalLiabilities:        { type: Number, default: 0 },
    proposedEMI:             { type: Number, default: 0 },
    dbrPercentage:           { type: Number, default: 0 },
    maxAllowedDBR:           { type: Number, default: 50 },
    dbrStatus: {
      type: String,
      enum: ['Eligible', 'Borderline', 'Ineligible'],
      default: 'Eligible',
    },
    estimatedLTV:            { type: Number, default: 0 },
    maxLTV:                  { type: Number, default: 85 },
    maxLoanAmountBasedOnDBR: { type: Number, default: 0 },
    recommendedLoanAmount:   { type: Number, default: 0 },

    // ── Eligibility Result ───────────────────────────────────────
    isEligible:       { type: Boolean, default: false },
    eligibilityNotes: { type: String,  default: null },
    eligibilityScore: { type: Number,  default: 0 },
    riskGrade: {
      type: String,
      enum: ['Excellent', 'Good', 'Average', 'Risky'],
      default: 'Good',
    },

    // ── Audit ────────────────────────────────────────────────────
    stressInterestRate:  { type: Number, default: 7 },
    calculationVersion:  { type: String, default: 'v2' },
    calculatedAt:        { type: Date,   default: Date.now },
  },
  { timestamps: true }
);

// ── Indexes ──────────────────────────────────────────────────────
leadEligibilityCheckSchema.index({ leadId: 1, createdAt: -1 });
leadEligibilityCheckSchema.index({ checkedBy: 1 });
leadEligibilityCheckSchema.index({ isEligible: 1 });

// ── Statics ──────────────────────────────────────────────────────
leadEligibilityCheckSchema.statics.getLatestForLead = function (leadId) {
  return this.findOne({ leadId }).sort({ createdAt: -1 });
};

leadEligibilityCheckSchema.statics.isLeadEligible = async function (leadId) {
  const latest = await this.getLatestForLead(leadId);
  return latest ? latest.isEligible : false;
};

const LeadEligibilityCheck =
  mongoose.models.LeadEligibilityCheck ||
  mongoose.model('LeadEligibilityCheck', leadEligibilityCheckSchema);

export default LeadEligibilityCheck;