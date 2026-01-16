const mongoose = require("mongoose");

const BankMortgageOfferSchema = new mongoose.Schema(
  {
    // ======================
    // BANK INFO
    // ======================
    bankInfo: {
      bankName: { type: String, required: true },
      logo: { type: String, default: "" }
    },

    // ======================
    // OFFER SUMMARY (CARD VIEW)
    // ======================
    offerSummary: {
      title: { type: String, required: true }, // "1-2 Year Fixed Select Offer"
      popularityTag: { type: String, default: "Popular" },

      productType: {
        type: String,
        enum: ["FIXED", "VARIABLE"],
        required: true
      },

      fixedYears: {
        type: Number, // 5
        default: null
      },

      initialRate: { type: Number, required: true }, // 3.99
      monthlyEMI: { type: Number, required: true }, // 1921
      currency: { type: String, default: "AED" },

      totalUpfrontCost: { type: Number, required: true }
    },

    // ======================
    // LOAN DETAILS
    // ======================
    loanDetails: {
      tenureYears: { type: Number, default: 25 },

      followOnRate: {
        type: String, // "1.69% + 3 Months Eibor"
        default: ""
      },

      loanToValue: {
        type: Number, // 65
        required: true
      },

      interestType: {
        type: String,
        enum: ["CONVENTIONAL", "ISLAMIC"],
        default: "CONVENTIONAL"
      },

      overpaymentAllowedPercent: {
        type: Number, // 25
        default: 0
      }
    },

    // ======================
    // COST BREAKDOWN
    // ======================
    costBreakdown: {
      downPayment: Number,
      dldFee: Number,
      mortgageRegistrationFee: Number,
      trusteeFee: Number,
      bankProcessingFee: Number,
      valuationFee: Number,
      feesAddedToLoan: Number,
      totalUpfrontCost: Number
    },

    // ======================
    // INSURANCE
    // ======================
    insurance: {
      lifeInsurance: {
        type: String,
        default: "--"
      },
      propertyInsurance: {
        type: String,
        default: "--"
      }
    },

    // ======================
    // ELIGIBILITY / META
    // ======================
    eligibility: {
      minLTV: Number,
      maxLTV: Number
    },

    meta: {
      isActive: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model(
    "BankMortgageProduct",
    BankMortgageOfferSchema,
    "BankMortgageProduct"
);

// export default mongoose.model(
//   "BankMortgageProduct",
//   BankMortgageOfferSchema,
//   "BankMortgageProduct"
// );