const mongoose = require("mongoose");

// ======================
// SUB-SCHEMAS
// ======================

// Bank Info Schema
const BankInfoSchema = new mongoose.Schema(
  {
    bankName: { type: String, required: true, index: true },
    bankCode: { type: String, required: true, unique: true },
    logo: { type: String, default: "" },
    website: { type: String, default: "" },
    customerCare: { type: String, default: "" },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    reviewCount: { type: Number, default: 0 },
  },
  { _id: false }
);

// Offer Summary Schema
const OfferSummarySchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    shortDescription: { type: String, default: "" },
    popularityTag: { type: String, default: "Popular" },
    badge: { type: String, enum: ["Popular", "Best Rate", "Lowest Fees", "New", null], default: null },
    productType: { type: String, enum: ["FIXED", "VARIABLE", "ISLAMIC"], required: true },
    fixedYears: { type: Number, default: null },
    initialRate: { type: Number, required: true },
    comparisonRate: { type: Number, default: null },
    monthlyEMI: { type: Number, required: true },
    currency: { type: String, default: "AED" },
    totalUpfrontCost: { type: Number, required: true },
    maxLoanAmount: { type: Number, default: null },
  },
  { _id: false }
);

// Loan Details Schema
const LoanDetailsSchema = new mongoose.Schema(
  {
    tenureYears: { type: Number, default: 25 },
    minTenureYears: { type: Number, default: 5 },
    maxTenureYears: { type: Number, default: 30 },
    followOnRate: { type: String, default: "" },
    followOnRateType: { type: String, enum: ["Fixed", "Variable", "EIBOR +", null], default: null },
    loanToValue: { type: Number, required: true },
    minLoanToValue: { type: Number, default: 20 },
    maxLoanToValue: { type: Number, default: 85 },
    interestType: { type: String, enum: ["CONVENTIONAL", "ISLAMIC"], default: "CONVENTIONAL" },
    overpaymentAllowedPercent: { type: Number, default: 25 },
    earlySettlementFee: { type: String, default: "1% of outstanding amount" },
    earlySettlementFreeAfterYears: { type: Number, default: 3 },
    latePaymentFee: { type: String, default: "2% per month" },
    paymentHolidayAllowed: { type: Boolean, default: false },
    paymentHolidayDays: { type: Number, default: 0 },
  },
  { _id: false }
);

// Cost Breakdown Schema
const CostBreakdownSchema = new mongoose.Schema(
  {
    propertyPrice: { type: Number, default: null },
    downPayment: { type: Number, required: true },
    downPaymentPercentage: { type: Number, default: null },
    dldFee: { type: Number, default: 0 },
    mortgageRegistrationFee: { type: Number, default: 0 },
    trusteeFee: { type: Number, default: 0 },
    bankProcessingFee: { type: Number, default: 0 },
    bankProcessingFeeType: { type: String, enum: ["Fixed", "Percentage"], default: "Fixed" },
    valuationFee: { type: Number, default: 2500 },
    propertyInsuranceFee: { type: Number, default: 0 },
    lifeInsuranceFee: { type: Number, default: 0 },
    agencyFee: { type: Number, default: 0 },
    conveyanceFee: { type: Number, default: 0 },
    feesAddedToLoan: { type: Number, default: 0 },
    totalUpfrontCost: { type: Number, required: true },
    payableByBuyer: { type: Number, default: 0 },
    payableBySeller: { type: Number, default: 0 },
  },
  { _id: false }
);

// Insurance Schema
const InsuranceSchema = new mongoose.Schema(
  {
    lifeInsurance: { type: String, default: "--" },
    lifeInsuranceRequired: { type: Boolean, default: false },
    lifeInsuranceCost: { type: Number, default: 0 },
    propertyInsurance: { type: String, default: "--" },
    propertyInsuranceRequired: { type: Boolean, default: true },
    propertyInsuranceCost: { type: Number, default: 0 },
    mortgageProtection: { type: String, default: "--" },
  },
  { _id: false }
);

// Eligibility Schema
const EligibilitySchema = new mongoose.Schema(
  {
    minSalary: { type: Number, default: 15000 },
    maxSalary: { type: Number, default: null },
    minAge: { type: Number, default: 21 },
    maxAge: { type: Number, default: 70 },
    minLoanAmount: { type: Number, default: 50000 },
    maxLoanAmount: { type: Number, default: null },
    minLTV: { type: Number, default: 20 },
    maxLTV: { type: Number, default: 85 },
    eligibleNationalities: [{ type: String }],
    eligibleEmploymentTypes: [{ type: String, enum: ["Salaried", "Self-Employed", "Both"] }],
    minExperienceYears: { type: Number, default: 1 },
    minEmploymentYears: { type: Number, default: 1 },
    visaRequired: { type: Boolean, default: true },
  },
  { _id: false }
);

// Documentation Schema
const DocumentationSchema = new mongoose.Schema(
  {
    requiredDocs: [{ type: String }],
    processingTime: { type: String, default: "5-7 working days" },
    approvalValidity: { type: String, default: "60 days" },
  },
  { _id: false }
);

// Features Schema
const FeaturesSchema = new mongoose.Schema(
  {
    keyFeatures: [{ type: String }],
    benefits: [{ type: String }],
    termsAndConditions: [{ type: String }],
    disclaimers: [{ type: String }],
  },
  { _id: false }
);

// ======================
// MAIN SCHEMA
// ======================
const BankMortgageOfferSchema = new mongoose.Schema(
  {
    bankInfo: { type: BankInfoSchema, required: true },
    offerSummary: { type: OfferSummarySchema, required: true },
    loanDetails: { type: LoanDetailsSchema, required: true },
    costBreakdown: { type: CostBreakdownSchema, required: true },
    insurance: { type: InsuranceSchema, default: () => ({}) },
    eligibility: { type: EligibilitySchema, default: () => ({}) },
    documentation: { type: DocumentationSchema, default: () => ({}) },
    features: { type: FeaturesSchema, default: () => ({}) },
    reviews: {
      averageRating: { type: Number, default: 0 },
      totalReviews: { type: Number, default: 0 },
      ratings: {
        1: { type: Number, default: 0 },
        2: { type: Number, default: 0 },
        3: { type: Number, default: 0 },
        4: { type: Number, default: 0 },
        5: { type: Number, default: 0 },
      },
    },
    displayOrder: { type: Number, default: 0 },
    isPopular: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    meta: {
      isActive: { type: Boolean, default: true },
      isDeleted: { type: Boolean, default: false },
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    },
  },
  { timestamps: true }
);

// ======================
// INDEXES
// ======================
BankMortgageOfferSchema.index({ "bankInfo.bankName": 1 });
BankMortgageOfferSchema.index({ "bankInfo.bankCode": 1 });
BankMortgageOfferSchema.index({ "offerSummary.initialRate": -1 });
BankMortgageOfferSchema.index({ isPopular: 1, isFeatured: 1 });
BankMortgageOfferSchema.index({ displayOrder: 1 });

// ======================
// VIRTUALS
// ======================
BankMortgageOfferSchema.virtual("displayName").get(function () {
  return `${this.bankInfo.bankName} - ${this.offerSummary.title} (${this.offerSummary.initialRate}%)`;
});

BankMortgageOfferSchema.virtual("formattedInitialRate").get(function () {
  return `${this.offerSummary.initialRate}%`;
});

// ======================
// METHODS
// ======================
BankMortgageOfferSchema.methods.isCustomerEligible = function (customerData) {
  const { monthlySalary, age, nationality, employmentType, loanAmount } = customerData;
  
  if (monthlySalary && this.eligibility.minSalary && monthlySalary < this.eligibility.minSalary) {
    return { eligible: false, reason: `Minimum salary requirement: ${this.eligibility.minSalary} AED` };
  }
  
  if (age && this.eligibility.maxAge && age > this.eligibility.maxAge) {
    return { eligible: false, reason: `Maximum age limit: ${this.eligibility.maxAge} years` };
  }
  
  if (nationality && this.eligibility.eligibleNationalities?.length) {
    if (!this.eligibility.eligibleNationalities.includes("All") &&
        !this.eligibility.eligibleNationalities.includes(nationality) &&
        !this.eligibility.eligibleNationalities.includes("GCC")) {
      return { eligible: false, reason: "Nationality not eligible for this product" };
    }
  }
  
  return { eligible: true, reason: null };
};

BankMortgageOfferSchema.methods.calculateEMI = function (loanAmount, tenureYears = null) {
  const principal = loanAmount;
  const annualRate = this.offerSummary.initialRate / 100;
  const monthlyRate = annualRate / 12;
  const tenureMonths = (tenureYears || this.loanDetails.tenureYears) * 12;
  
  const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths) / (Math.pow(1 + monthlyRate, tenureMonths) - 1);
  
  return Math.round(emi);
};

// ======================
// STATIC METHODS
// ======================
BankMortgageOfferSchema.statics.getBestRates = function (limit = 10) {
  return this.find({ "meta.isActive": true })
    .sort({ "offerSummary.initialRate": 1, displayOrder: 1 })
    .limit(limit);
};

BankMortgageOfferSchema.statics.getPopularProducts = function (limit = 10) {
  return this.find({ "meta.isActive": true, isPopular: true })
    .sort({ displayOrder: 1 })
    .limit(limit);
};

BankMortgageOfferSchema.set("toJSON", { virtuals: true });
BankMortgageOfferSchema.set("toObject", { virtuals: true });

const BankMortgageProduct = mongoose.model(
  "BankMortgageProduct",
  BankMortgageOfferSchema,
  "BankMortgageProduct"
);

module.exports = BankMortgageProduct;