const mongoose = require('mongoose');

// ==================== EMBEDDED SCHEMAS ====================

const clientPersonalSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    preferredName: { type: String, default: null },
    gender: { type: String, enum: ['Male', 'Female'], required: true },
    dateOfBirth: { type: Date, required: true },
    nationality: { type: String, required: true },
    maritalStatus: { type: String, enum: ['Single', 'Married', 'Divorced', 'Widowed'], required: true },
    numberOfDependents: { type: Number, default: 0 },
    email: { type: String, required: true, lowercase: true },
    mobile: { type: String, required: true },
    homePhone: { type: String, default: null },
    workPhone: { type: String, default: null },
    whatsapp: { type: String, default: null },
  },
  { _id: false }
);

const addressSchema = new mongoose.Schema(
  {
    building: { type: String, default: null },
    apartment: { type: String, default: null },
    area: { type: String, required: true },
    city: { type: String, default: 'Dubai' },
    country: { type: String, default: 'UAE' },
    residenceType: { type: String, enum: ['Owned', 'Rented', 'Company Provided'], default: null },
    yearsAtAddress: { type: Number, default: null },
  },
  { _id: false }
);

const employmentSchema = new mongoose.Schema(
  {
    employerName: { type: String, required: true },
    industry: { type: String, default: null },
    designation: { type: String, required: true },
    employmentType: { type: String, enum: ['Salaried', 'Self-Employed'], required: true },
    yearsWithEmployer: { type: Number, required: true },
    monthsWithEmployer: { type: Number, default: 0 },
    probationPeriod: { type: String, enum: ['Completed', 'Ongoing', 'Not Applicable'], default: 'Completed' },
    workAddress: { type: String, default: null },
    workPhone: { type: String, default: null },
    employerEmail: { type: String, default: null },
  },
  { _id: false }
);

const incomeSchema = new mongoose.Schema(
  {
    basicSalary: { type: Number, default: null },
    housingAllowance: { type: Number, default: null },
    transportAllowance: { type: Number, default: null },
    otherAllowances: { type: Number, default: null },
    totalMonthlySalary: { type: Number, required: true },
    annualBonus: { type: Number, default: 0 },
    otherIncome: { type: Number, default: 0 },
    totalMonthlyIncome: { type: Number, required: true },
    salaryTransferBank: { type: String, default: null },
    salaryTransferType: { type: String, enum: ['WPS', 'Manual', null], default: null },
  },
  { _id: false }
);

const expenseSchema = new mongoose.Schema(
  {
    monthlyRent: { type: Number, default: 0 },
    monthlyOtherLoanInstallments: { type: Number, default: 0 },
    monthlyCreditCardPayments: { type: Number, default: 0 },
    monthlyLivingExpenses: { type: Number, default: 0 },
    totalMonthlyLiabilities: { type: Number, default: 0 },
    dbrPercentage: { type: Number, default: 0 },
    dbrStatus: { type: String, enum: ['Eligible', 'Borderline', 'Ineligible'], default: 'Eligible' },
    existingLoans: [
      {
        type: { type: String, enum: ['Car Loan', 'Personal Loan', 'Other'], required: true },
        bank: { type: String, required: true },
        outstandingAmount: { type: Number, required: true },
        monthlyInstallment: { type: Number, required: true },
        tenureRemainingMonths: { type: Number, required: true },
      },
    ],
  },
  { _id: false }
);

const propertySchema = new mongoose.Schema(
  {
    propertyType: { type: String, enum: ['Ready', 'Off-plan', 'Commercial'], required: true },
    propertySubtype: { type: String, enum: ['Apartment', 'Villa', 'Townhouse', 'Penthouse'], required: true },
    propertyValue: { type: Number, required: true },
    valuationAmount: { type: Number, default: null },
    ltvPercentage: { type: Number, default: null },
    loanAmount: { type: Number, default: null },
    downPayment: { type: Number, default: null },
    downPaymentSource: { type: String, default: null },
    propertyAddress: {
      building: { type: String, required: true },
      apartment: { type: String, default: null },
      floor: { type: Number, default: null },
      area: { type: String, required: true },
      city: { type: String, default: 'Dubai' },
      emirate: { type: String, default: 'Dubai' },
    },
    propertyDetails: {
      bedrooms: { type: Number, default: null },
      bathrooms: { type: Number, default: null },
      areaSqft: { type: Number, default: null },
      areaSqm: { type: Number, default: null },
      yearBuilt: { type: Number, default: null },
      view: { type: String, default: null },
      furnishing: { type: String, enum: ['Furnished', 'Semi-Furnished', 'Unfurnished'], default: null },
      parkingSpaces: { type: Number, default: 0 },
    },
    ownershipDetails: {
      currentOwner: { type: String, required: true },
      ownerType: { type: String, enum: ['Individual', 'Developer', 'Company'], required: true },
      titleDeedNumber: { type: String, default: null },
      titleDeedUrl: { type: String, default: null },
      nocAvailable: { type: Boolean, default: false },
    },
    transactionDetails: {
      purchasePrice: { type: Number, required: true },
      agreementDate: { type: Date, required: true },
      handoverDate: { type: Date, default: null },
      depositPaid: { type: Number, default: 0 },
      depositPaidDate: { type: Date, default: null },
      agentCommission: { type: Number, default: 0 },
      dldFees: { type: Number, default: 0 },
      registrationFees: { type: Number, default: 0 },
      totalClosingCosts: { type: Number, default: 0 },
    },
  },
  { _id: false }
);

const loanSchema = new mongoose.Schema(
  {
    requestedAmount: { type: Number, required: true },
    approvedAmount: { type: Number, default: null },
      disbursedAmount: { type: Number, default: null },  // ✅ ADD THIS
    tenureYears: { type: Number, required: true },
    tenureMonths: { type: Number, required: true },
    interestRateType: { type: String, enum: ['Fixed', 'Variable'], required: true },
    interestRatePercentage: { type: Number, required: true },
    processingFee: { type: Number, default: 0 },
    valuationFee: { type: Number, default: 0 },
    earlySettlementFeePercentage: { type: Number, default: 1 },
    earlySettlementAllowedAfterYears: { type: Number, default: 3 },
    lifeInsuranceRequired: { type: Boolean, default: true },
    propertyInsuranceRequired: { type: Boolean, default: true },
    monthlyInstallment: {
      principalAndInterest: { type: Number, required: true },
      lifeInsurance: { type: Number, default: 0 },
      propertyInsurance: { type: Number, default: 0 },
      totalMonthlyPayment: { type: Number, required: true },
    },
    selectedBank: { type: String, required: true },
    selectedBankProduct: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankMortgageProduct',
      required: true
    }
  },
  { _id: false }
);

const documentRequirementSchema = new mongoose.Schema(
  {
    documentType: { type: String, required: true },
    isRequired: { type: Boolean, default: true },
    isUploaded: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
    uploadedAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
  },
  { _id: false }
);

const documentStatusSchema = new mongoose.Schema(
  {
    allDocumentsUploaded: { type: Boolean, default: false },
    allDocumentsVerified: { type: Boolean, default: false },
    documentsUploadedCount: { type: Number, default: 0 },
    documentsVerifiedCount: { type: Number, default: 0 },
    documentsRejectedCount: { type: Number, default: 0 },
    documentsPendingCount: { type: Number, default: 0 },
    pendingDocumentTypes: [{ type: String }],
    verificationNotes: { type: String, default: null },
    requiredDocuments: [documentRequirementSchema],
    completionPercentage: { type: Number, default: 0 },
  },
  { _id: false }
);

const bankSubmissionSchema = new mongoose.Schema(
  {
    submittedToBankAt: { type: Date, default: null },
    bankProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankProduct' },
    bankName: { type: String, default: null },
    bankBranch: { type: String, default: null },
    bankRelationshipManager: { type: String, default: null },
    bankRmContact: { type: String, default: null },
    submittedDocumentsPackage: { type: String, default: null },
    bankReferenceNumber: { type: String, default: null },
    bankNotes: { type: String, default: null },
  },
  { _id: false }
);

const commissionInfoSchema = new mongoose.Schema(
  {
    loanAmount: { type: Number, required: true },
    loanTier: { type: String, enum: ['≤5M AED', '>5M AED'], required: true },
    partnerPercentage: { type: Number, required: true },
    xotoCommissionFromBank: { type: Number, required: true },
    partnerCommissionAmount: { type: Number, required: true },
    calculation: { type: String, required: true },
    status: { type: String, enum: ['Pending Disbursement', 'Confirmed', 'Paid'], default: 'Pending Disbursement' },
    expectedPaymentDate: { type: Date, default: null },
    paidAt: { type: Date, default: null },
  },
  { _id: false }
);

// ==================== MAIN CASE SCHEMA ====================
const caseSchema = new mongoose.Schema(
  {
    caseReference: { type: String, unique: true, required: true },
    proposalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Proposal', default: null },
    sourceLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'VaultLead', default: null },

    createdBy: {
      role: { type: String, enum: ['partner', 'admin', 'advisor'], required: true },
      partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', default: null },
      partnerName: { type: String, default: null },
      advisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'XotoAdvisor', default: null },
      advisorName: { type: String, default: null },
      adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
      adminName: { type: String, default: null },
      createdAt: { type: Date, default: Date.now },
    },

    assignedTo: {
      opsId: { type: mongoose.Schema.Types.ObjectId, ref: 'MortgageOps', default: null },
      opsName: { type: String, default: null },
      assignedAt: { type: Date, default: null },
      assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
    },

    // ✅ Auto-populated from Lead
    clientInfo: { type: clientPersonalSchema, required: true },
    currentAddress: { type: addressSchema, default: null },
    previousAddress: { type: addressSchema, default: null },

    // ✅ New data (not in Lead)
    employmentDetails: { type: employmentSchema, required: true },
    incomeDetails: { type: incomeSchema, required: true },
    expenseDetails: { type: expenseSchema, default: () => ({}) },

    // ✅ Auto-populated from Lead
    propertyInfo: { type: propertySchema, required: true },

    // ✅ Auto-populated from Proposal
    loanInfo: { type: loanSchema, required: true },

    bankDecision: {
      status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
      approvedAmount: { type: Number, default: null },
      interestRate: { type: Number, default: null },
      decisionAt: { type: Date, default: null }
    },

    documentStatus: { type: documentStatusSchema, default: () => ({}) },
    documentsCopiedFromLead: { type: Boolean, default: false },

    currentStatus: {
      type: String,
      enum: [
        'Draft',
        'Submitted to Xoto',
        'In Ops Queue - Pending Pick-up',
        'Assigned - Pending Review',
        'Under Review',
        'Returned - Pending Correction',
        'Resubmitted-After Correction' ,
        'Bank Application',
        'Collecting Documentation',
        'Pre-Approved',
        'Valuation',
        'FOL Processed',
        'FOL Issued',
        'FOL Signed',
        'Disbursed',
        'Rejected',
        'Lost',
      ],
      default: 'Draft',
    },

    nextExpectedStatus: { type: String, default: null },
    estimatedCompletionDate: { type: Date, default: null },

    bankSubmission: { type: bankSubmissionSchema, default: () => ({}) },

    commissionInfo: { type: commissionInfoSchema, default: null },

 // ✅ CORRECT - Just define the structure
internalNotes: [
  {
    note: { type: String, required: true },
    addedBy: { type: String, required: true },
    addedAt: { type: Date, default: Date.now },
  }
],

customerNotes: [
  {
    note: { type: String, required: true },
    addedBy: { type: String, required: true },
    addedAt: { type: Date, default: Date.now },
  }
],
    calculations: {
      loanAmount: { type: Number, default: 0 },
      ltv: { type: Number, default: 0 },
      emi: { type: Number, default: 0 },
      dbr: { type: Number, default: 0 },
      totalUpfrontCost: { type: Number, default: 0 },
      monthlyPayment: { type: Number, default: 0 },
      totalInterestPayable: { type: Number, default: 0 },
      totalAmountPayable: { type: Number, default: 0 }
    },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ==================== INDEXES ====================
caseSchema.index({ caseReference: 1 }, { unique: true });
caseSchema.index({ sourceLeadId: 1 });
caseSchema.index({ proposalId: 1 });
caseSchema.index({ currentStatus: 1 });
caseSchema.index({ 'assignedTo.opsId': 1 });
caseSchema.index({ createdAt: -1 });

// ==================== VIRTUALS ====================
caseSchema.virtual('clientAge').get(function () {
  if (!this.clientInfo.dateOfBirth) return null;
  const ageDiff = Date.now() - this.clientInfo.dateOfBirth.getTime();
  const ageDate = new Date(ageDiff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
});

// ==================== METHODS ====================

// Calculate EMI
function calculateEMI(principal, annualRate, tenureYears) {
  const monthlyRate = annualRate / 100 / 12;
  const months = tenureYears * 12;
  if (monthlyRate === 0) return principal / months;
  const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, months) /
    (Math.pow(1 + monthlyRate, months) - 1);
  return Math.round(emi);
}

// Initialize required documents based on employment type
caseSchema.methods.initializeRequiredDocuments = function () {
  const employmentType = this.employmentDetails?.employmentType;

  let requiredDocs = [
    { documentType: 'bank_application_form', isRequired: true },
    { documentType: 'emirates_id_front', isRequired: true },
    { documentType: 'emirates_id_back', isRequired: true },
    { documentType: 'passport', isRequired: true },
    { documentType: 'title_deed', isRequired: true },
    { documentType: 'consent_form', isRequired: true },
  ];

  if (this.clientInfo?.nationality !== 'United Arab Emirates') {
    requiredDocs.push({ documentType: 'visa', isRequired: true });
  }

  if (employmentType === 'Salaried') {
    requiredDocs.push(
      { documentType: 'bank_statements', isRequired: true },
      { documentType: 'salary_certificate', isRequired: true },
      { documentType: 'payslips', isRequired: false }
    );
  } else if (employmentType === 'Self-Employed') {
    requiredDocs.push(
      { documentType: 'bank_statements', isRequired: true },
      { documentType: 'trade_license', isRequired: true },
      { documentType: 'moa', isRequired: true },
      { documentType: 'audit_reports', isRequired: true },
      { documentType: 'vat_returns', isRequired: true }
    );
  }

  this.documentStatus.requiredDocuments = requiredDocs.map(doc => ({
    documentType: doc.documentType,
    isRequired: doc.isRequired,
    isUploaded: false,
    isVerified: false,
  }));

  return this;
};

// Update document status
caseSchema.methods.updateDocumentStatus = async function () {
  const Document = mongoose.model('Document');
  const uploadedDocs = await Document.find({
    entityType: 'Case',
    entityId: this._id,
    isDeleted: false
  });

  let uploadedCount = 0;
  let verifiedCount = 0;
  let rejectedCount = 0;
  let pendingCount = 0;
  const pendingTypes = [];

  for (let doc of this.documentStatus.requiredDocuments) {
    const found = uploadedDocs.find(d => d.documentType === doc.documentType);

    if (found) {
      doc.isUploaded = true;
      doc.documentId = found._id;
      doc.uploadedAt = found.uploadedAt;
      uploadedCount++;

      if (found.verificationStatus === 'verified') {
        doc.isVerified = true;
        verifiedCount++;
      } else if (found.verificationStatus === 'rejected') {
        rejectedCount++;
      } else {
        pendingCount++;
        pendingTypes.push(doc.documentType);
      }
    } else {
      doc.isUploaded = false;
      pendingTypes.push(doc.documentType);
      pendingCount++;
    }
  }

  this.documentStatus.documentsUploadedCount = uploadedCount;
  this.documentStatus.documentsVerifiedCount = verifiedCount;
  this.documentStatus.documentsRejectedCount = rejectedCount;
  this.documentStatus.documentsPendingCount = pendingCount;
  this.documentStatus.pendingDocumentTypes = pendingTypes;
  this.documentStatus.allDocumentsUploaded = pendingTypes.length === 0;
  this.documentStatus.allDocumentsVerified = pendingCount === 0 && rejectedCount === 0;
  this.documentStatus.completionPercentage = this.documentStatus.requiredDocuments.length > 0 ?
    (uploadedCount / this.documentStatus.requiredDocuments.length) * 100 : 0;

  return this.save();
};

// Calculate all financial metrics
caseSchema.methods.calculateFinancialMetrics = function () {
  const propertyValue = this.propertyInfo?.propertyValue || 0;
  const downPayment = this.propertyInfo?.downPayment || 0;
  const loanAmount = propertyValue - downPayment;
  const ltv = propertyValue > 0 ? (loanAmount / propertyValue) * 100 : 0;

  const interestRate = this.loanInfo?.interestRatePercentage || 0;
  const tenureYears = this.loanInfo?.tenureYears || 25;
  const emi = calculateEMI(loanAmount, interestRate, tenureYears);

  const totalInterestPayable = (emi * tenureYears * 12) - loanAmount;
  const totalAmountPayable = emi * tenureYears * 12;

  const monthlyIncome = this.incomeDetails?.totalMonthlyIncome || 0;
  const monthlyLiabilities = this.expenseDetails?.totalMonthlyLiabilities || 0;
  const dbr = monthlyIncome > 0 ? ((emi + monthlyLiabilities) / monthlyIncome) * 100 : 0;

  const dldFee = propertyValue * 0.04;
  const registrationFee = loanAmount * 0.0025;
  const valuationFee = this.loanInfo?.valuationFee || 2500;
  const processingFee = this.loanInfo?.processingFee || 0;
  const totalUpfrontCost = dldFee + registrationFee + valuationFee + processingFee;

  this.calculations = {
    loanAmount: Math.round(loanAmount),
    ltv: Math.round(ltv * 100) / 100,
    emi: Math.round(emi),
    dbr: Math.round(dbr * 100) / 100,
    totalUpfrontCost: Math.round(totalUpfrontCost),
    monthlyPayment: Math.round(emi + (this.loanInfo?.lifeInsuranceRequired ? 150 : 0) + (this.loanInfo?.propertyInsuranceRequired ? 85 : 0)),
    totalInterestPayable: Math.round(totalInterestPayable),
    totalAmountPayable: Math.round(totalAmountPayable)
  };

  return this;
};

// ==================== PRE-SAVE MIDDLEWARE ====================
caseSchema.pre('save', function (next) {
  if (this.isNew) {
    this.initializeRequiredDocuments();
  }

  if (this.isModified('incomeDetails') || this.isModified('expenseDetails') ||
    this.isModified('propertyInfo.propertyValue') || this.isModified('propertyInfo.downPayment') ||
    this.isModified('loanInfo.interestRatePercentage')) {
    this.calculateFinancialMetrics();
  }

  if (this.isModified('loanInfo.selectedBankProduct')) {
    this.bankSubmission.bankProductId = this.loanInfo.selectedBankProduct;
  }

  next();
});

const Case = mongoose.models.Case || mongoose.model('Case', caseSchema);
module.exports = Case;