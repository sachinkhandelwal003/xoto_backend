const mongoose = require('mongoose');

// ==================== LEAD CAPTURE SCHEMA (PRD Section 4.3) ====================
// PRD requires: Name + Phone Number only at lead stage
// All other fields are optional at lead stage (to be filled by Advisor during enrichment)

const customerBasicSchema = new mongoose.Schema(
  {
    // ✅ PRD REQUIRED at lead capture (Section 4.3)
    fullName: { type: String, required: true },
    mobileNumber: { type: String, required: true },
    
    // ⚠️ PRD says optional at lead stage (can be captured later)
    email: { type: String, lowercase: true, default: null },  // Changed from required to optional
    
    // ⬇️ All below are OPTIONAL at lead stage - will be filled by Advisor during enrichment (Section 6.1)
    gender: { type: String, enum: ['Male', 'Female', 'Other'], default: null },
    preferredName: { type: String, default: null },
    alternativePhone: { type: String, default: null },
    whatsappNumber: { type: String, default: null },
    dateOfBirth: { type: Date, default: null },  // Changed from required to optional
    nationality: { type: String, default: null },  // Changed from required to optional
    maritalStatus: { 
      type: String, 
      enum: ['Single', 'Married', 'Divorced', 'Widowed'], 
      default: null  // Changed from required to optional
    },
    numberOfDependents: { type: Number, default: 0 },
    occupation: { type: String, default: null },
    employer: { type: String, default: null },
    monthlySalary: { type: Number, default: null },
  },
  { _id: false }
);

// ==================== PROPERTY DETAILS (PRD Section 5.3) ====================
// Property details are captured during APPLICATION creation, NOT at lead stage
// Making all fields optional at lead stage

const propertyDetailsSchema = new mongoose.Schema(
  {
    // ⬇️ All are OPTIONAL at lead stage - will be captured during Application creation (Section 5.3)
    propertyType: { type: String, enum: ['Ready', 'Off-plan', 'Commercial'], default: null },  // Changed from required to optional
    propertySubtype: { type: String, enum: ['Apartment', 'Villa', 'Townhouse', 'Penthouse'], default: null },
    propertyValue: { type: Number, default: null },  // Changed from required to optional
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

// Add to leadSchema

// ==================== FINANCIAL CALCULATIONS (for Lead) ====================
const leadFinancialSchema = new mongoose.Schema(
  {
    // Income Details
    monthlySalary: { type: Number, default: null },
    otherIncome: { type: Number, default: 0 },
    totalMonthlyIncome: { type: Number, default: 0 },
    
    // Liabilities
    existingLoanEMIs: { type: Number, default: 0 },
    creditCardPayments: { type: Number, default: 0 },
    totalMonthlyLiabilities: { type: Number, default: 0 },
    
    // Property Details (basic for calculation)
    estimatedPropertyValue: { type: Number, default: null },
    estimatedLoanAmount: { type: Number, default: null },
    estimatedLTV: { type: Number, default: null }, // Loan/Property %
    
    // DBR Calculation
    proposedEMI: { type: Number, default: 0 },
    totalCommitments: { type: Number, default: 0 }, // proposedEMI + existingLiabilities
    dbrPercentage: { type: Number, default: 0 }, // (totalCommitments / monthlyIncome) * 100
    dbrStatus: { 
      type: String, 
      enum: ['Eligible', 'Borderline', 'Ineligible'], 
      default: 'Eligible' 
    },
    
    // Eligibility Summary
    isEligible: { type: Boolean, default: false },
    eligibilityNotes: { type: String, default: null },
    maxLoanAmountBasedOnDBR: { type: Number, default: null },
    recommendedLoanAmount: { type: Number, default: null },
  },
  { _id: false }
);

// Add to leadSchema

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
      financialCalculation: { type: leadFinancialSchema, default: () => ({}) },

      financialCalculation: { type: leadFinancialSchema, default: () => ({}) },
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
    
    // ⚠️ propertyDetails is now OPTIONAL at lead stage (PRD Section 5.3)
    propertyDetails: { type: propertyDetailsSchema, default: () => ({}) },  // Changed from required to optional

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
leadSchema.index({ 'assignedTo.advisorId': 1 });
leadSchema.index({ 'sla.deadline': 1 });
leadSchema.index({ 'sla.breached': 1 });

// Virtuals
leadSchema.virtual('customerAge').get(function () {
  if (!this.customerInfo.dateOfBirth) return null;
  const ageDiff = Date.now() - this.customerInfo.dateOfBirth.getTime();
  const ageDate = new Date(ageDiff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
});

// Methods
leadSchema.methods.updateDocumentStatus = function (uploadedCount, verifiedCount) {
  const totalRequired = this.documentCollection.totalDocumentsRequired || 7;
  
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
// ==================== DBR & LTV CALCULATION METHOD FOR LEAD ====================
leadSchema.methods.calculateEligibility = function () {
  const monthlySalary = this.customerInfo?.monthlySalary || 0;
  const otherIncome = this.financialCalculation?.otherIncome || 0;
  const totalMonthlyIncome = monthlySalary + otherIncome;
  
  // Existing liabilities
  const existingLoanEMIs = this.financialCalculation?.existingLoanEMIs || 0;
  const creditCardPayments = this.financialCalculation?.creditCardPayments || 0;
  const existingLiabilities = existingLoanEMIs + creditCardPayments;
  
  // Property & Loan estimates
  const propertyValue = this.propertyDetails?.propertyValue || this.financialCalculation?.estimatedPropertyValue || 0;
  const requestedLoanAmount = this.financialCalculation?.estimatedLoanAmount || 0;
  
  // Calculate LTV (Loan to Value)
  let ltv = 0;
  let maxLoanByLTV = 0;
  let recommendedLoanAmount = 0;
  
  if (propertyValue > 0) {
    // Based on PRD: Max LTV 85% for UAE Nationals/Residents, 75% for Non-Residents
    const residencyStatus = this.customerInfo?.nationality === 'UAE National' ? 'UAE National' : 
                           (this.customerInfo?.residencyStatus || 'UAE Resident');
    let maxLTV = 85; // Default for UAE Nationals/Residents
    if (residencyStatus === 'Non-Resident') maxLTV = 75;
    if (propertyValue > 5000000) maxLTV = 80; // For properties above 5M AED
    
    maxLoanByLTV = propertyValue * (maxLTV / 100);
    ltv = requestedLoanAmount > 0 ? (requestedLoanAmount / propertyValue) * 100 : 0;
  }
  
  // Calculate proposed EMI
  let proposedEMI = 0;
  if (requestedLoanAmount > 0) {
    const interestRate = 4.0; // Default rate, can be dynamic
    const tenureYears = this.loanRequirements?.preferredTenureYears || 25;
    const monthlyRate = interestRate / 100 / 12;
    const months = tenureYears * 12;
    if (monthlyRate > 0) {
      proposedEMI = requestedLoanAmount * monthlyRate * Math.pow(1 + monthlyRate, months) /
                    (Math.pow(1 + monthlyRate, months) - 1);
    } else {
      proposedEMI = requestedLoanAmount / months;
    }
    proposedEMI = Math.round(proposedEMI);
  }
  
  // Calculate DBR (Debt Burden Ratio)
  const totalCommitments = proposedEMI + existingLiabilities;
  let dbrPercentage = 0;
  let dbrStatus = 'Eligible';
  let maxAllowedDBR = 50; // 50% for expats, 55% for UAE nationals
  
  if (totalMonthlyIncome > 0) {
    dbrPercentage = (totalCommitments / totalMonthlyIncome) * 100;
    
    // UAE Nationals have 55% DBR limit (PRD Section 4.5)
    const isUAENational = this.customerInfo?.nationality === 'UAE National' ||
                          this.customerInfo?.nationality === 'Emirati';
    maxAllowedDBR = isUAENational ? 55 : 50;
    
    if (dbrPercentage > maxAllowedDBR) {
      dbrStatus = 'Ineligible';
    } else if (dbrPercentage > maxAllowedDBR - 5) {
      dbrStatus = 'Borderline';
    } else {
      dbrStatus = 'Eligible';
    }
  }
  
  // Calculate max loan based on DBR
  let maxLoanAmountBasedOnDBR = 0;
  let isEligible = false;
  let eligibilityNotes = null;
  
  if (totalMonthlyIncome > 0 && maxAllowedDBR > 0) {
    const maxEMIPossible = (totalMonthlyIncome * maxAllowedDBR / 100) - existingLiabilities;
    if (maxEMIPossible > 0) {
      const interestRate = 4.0;
      const tenureYears = this.loanRequirements?.preferredTenureYears || 25;
      const monthlyRate = interestRate / 100 / 12;
      const months = tenureYears * 12;
      if (monthlyRate > 0) {
        maxLoanAmountBasedOnDBR = maxEMIPossible * (Math.pow(1 + monthlyRate, months) - 1) /
                                   (monthlyRate * Math.pow(1 + monthlyRate, months));
      } else {
        maxLoanAmountBasedOnDBR = maxEMIPossible * months;
      }
      maxLoanAmountBasedOnDBR = Math.round(maxLoanAmountBasedOnDBR);
    }
  }
  
  // Determine final eligibility
  recommendedLoanAmount = Math.min(maxLoanByLTV || requestedLoanAmount, maxLoanAmountBasedOnDBR || requestedLoanAmount);
  isEligible = dbrStatus === 'Eligible' && (requestedLoanAmount <= recommendedLoanAmount);
  
  if (!isEligible && dbrStatus !== 'Eligible') {
    eligibilityNotes = `DBR too high: ${dbrPercentage.toFixed(1)}% (Max: ${maxAllowedDBR}%)`;
  } else if (!isEligible && requestedLoanAmount > maxLoanByLTV) {
    eligibilityNotes = `Loan amount exceeds LTV limit: LTV ${ltv.toFixed(1)}% (Max: ${maxLTV}%)`;
  } else if (!isEligible && requestedLoanAmount > maxLoanAmountBasedOnDBR) {
    eligibilityNotes = `Loan exceeds affordability: Max based on income is AED ${maxLoanAmountBasedOnDBR.toLocaleString()}`;
  } else if (isEligible) {
    eligibilityNotes = `Customer is eligible for loan up to AED ${recommendedLoanAmount.toLocaleString()}`;
  }
  
  // Save calculations
  this.financialCalculation = {
    monthlySalary,
    otherIncome: this.financialCalculation?.otherIncome || 0,
    totalMonthlyIncome,
    existingLoanEMIs,
    creditCardPayments,
    totalMonthlyLiabilities: existingLiabilities,
    estimatedPropertyValue: propertyValue,
    estimatedLoanAmount: requestedLoanAmount,
    estimatedLTV: Math.round(ltv * 100) / 100,
    proposedEMI,
    totalCommitments,
    dbrPercentage: Math.round(dbrPercentage * 100) / 100,
    dbrStatus,
    isEligible,
    eligibilityNotes,
    maxLoanAmountBasedOnDBR,
    recommendedLoanAmount,
  };
  
  return this;
};

const VaultLead = mongoose.model('VaultLead', leadSchema);
module.exports = VaultLead;