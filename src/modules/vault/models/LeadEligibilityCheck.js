// models/LeadEligibilityCheck.js
const mongoose = require("mongoose");

const leadEligibilityCheckSchema = new mongoose.Schema(
  {
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VaultLead",
      required: true,
      index: true,
    },

    checkedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VaultAdvisor",
      required: true,
    },

    // =========================
    // CUSTOMER INPUTS
    // =========================
    monthlySalary: {
      type: Number,
      required: true,
    },

    otherIncome: {
      type: Number,
      default: 0,
    },

    existingLoanEMIs: { 
      type: Number,
      default: 0,
    },

    creditCardPayments: {
      type: Number,
      default: 0,
    },

    propertyValue: {
      type: Number,
      required: true,
    },

    requestedLoanAmount: {
      type: Number,
      required: true,
    },

    tenureYears: {
      type: Number,
      default: 25,
    },

    nationality: {
      type: String,
      default: null,
    },

    customerAge: {
      type: Number,
      default: null,
    },

    // =========================
    // CALCULATED VALUES
    // =========================
    totalMonthlyIncome: Number,
    totalLiabilities: Number,
    proposedEMI: Number,
    dbrPercentage: Number,
    maxAllowedDBR: Number,
    dbrStatus: {
      type: String,
      enum: ["Eligible", "Borderline", "Ineligible"],
    },
    estimatedLTV: Number,
    maxLTV: Number,
    maxLoanAmountBasedOnDBR: Number,
    recommendedLoanAmount: Number,

    // =========================
    // ELIGIBILITY
    // =========================
    isEligible: {
      type: Boolean,
      default: false,
    },
    eligibilityNotes: {
      type: String,
      default: null,
    },
    eligibilityScore: {
      type: Number,
      default: 0,
    },
    riskGrade: {
      type: String,
      enum: ["Excellent", "Good", "Average", "Risky"],
      default: "Good",
    },

    // =========================
    // AUDIT
    // =========================
    stressInterestRate: {
      type: Number,
      default: 7,
    },
    calculatedAt: {
      type: Date,
      default: Date.now,
    },
    calculationVersion: {
      type: String,
      default: "v2",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
leadEligibilityCheckSchema.index({ leadId: 1, createdAt: -1 });
leadEligibilityCheckSchema.index({ checkedBy: 1 });
leadEligibilityCheckSchema.index({ isEligible: 1 });

// Static method to get latest eligibility for a lead
leadEligibilityCheckSchema.statics.getLatestForLead = async function(leadId) {
  return this.findOne({ leadId }).sort({ createdAt: -1 });
};

// Static method to check if lead is eligible
leadEligibilityCheckSchema.statics.isLeadEligible = async function(leadId) {
  const latest = await this.getLatestForLead(leadId);
  return latest ? latest.isEligible : false;
};

module.exports = mongoose.model("LeadEligibilityCheck", leadEligibilityCheckSchema);