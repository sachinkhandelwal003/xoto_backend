const mongoose = require('mongoose');

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
    selectedBankProduct: { type: String, required: true },
    alternativeBanksConsidered: [{ type: String }],
  },
  { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: [
        'Submitted to Xoto',
        'Bank Application',
        'Collecting Documentation',
        'Pre-Approved',
        'Valuation',
        'FOL Processed',
        'FOL Issued',
        'FOL Signed',
        'Disbursed',
        'Rejected',
      ],
      required: true,
    },
    timestamp: { type: Date, default: Date.now },
    updatedBy: { type: String, required: true },
    notes: { type: String, default: null },
  },
  { _id: false }
);

const commissionSchema = new mongoose.Schema(
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
  },
  { _id: false }
);

const bankSubmissionSchema = new mongoose.Schema(
  {
    submittedToBankAt: { type: Date, default: null },
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

const caseSchema = new mongoose.Schema(
  {
    caseId: { type: String, unique: true, required: true },
    caseReference: { type: String, unique: true, required: true },
    proposalId: { type: String, default: null },
    sourceLeadId: { type: String, default: null },

    createdBy: {
      role: { type: String, enum: ['partner'], required: true },
      partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
      partnerName: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    },

    assignedTo: {
      xotoAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
      xotoAdminName: { type: String, default: null },
      assignedAt: { type: Date, default: null },
    },

    clientInfo: { type: clientPersonalSchema, required: true },
    currentAddress: { type: addressSchema, default: null },
    previousAddress: { type: addressSchema, default: null },
    employmentDetails: { type: employmentSchema, required: true },
    incomeDetails: { type: incomeSchema, required: true },
    expenseDetails: { type: expenseSchema, default: () => ({}) },

    propertyInfo: { type: propertySchema, required: true },

    loanInfo: { type: loanSchema, required: true },

    documentStatus: { type: documentStatusSchema, default: () => ({}) },

    currentStatus: {
      type: String,
      enum: [
        'Submitted to Xoto',
        'Bank Application',
        'Collecting Documentation',
        'Pre-Approved',
        'Valuation',
        'FOL Processed',
        'FOL Issued',
        'FOL Signed',
        'Disbursed',
        'Rejected',
      ],
      default: 'Submitted to Xoto',
    },
    statusHistory: [statusHistorySchema],
    nextExpectedStatus: { type: String, default: null },
    estimatedCompletionDate: { type: Date, default: null },

    bankSubmission: { type: bankSubmissionSchema, default: () => ({}) },

    commissionInfo: { type: commissionSchema, default: null },

    internalNotes: [
      {
        note: { type: String, required: true },
        addedBy: { type: String, required: true },
        addedAt: { type: Date, default: Date.now },
      },
    ],
    customerNotes: [
      {
        note: { type: String, required: true },
        addedBy: { type: String, required: true },
        addedAt: { type: Date, default: Date.now },
      },
    ],

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

caseSchema.index({ caseId: 1 }, { unique: true });
caseSchema.index({ caseReference: 1 }, { unique: true });
caseSchema.index({ sourceLeadId: 1 });
caseSchema.index({ 'createdBy.partnerId': 1 });
caseSchema.index({ currentStatus: 1 });
caseSchema.index({ 'clientInfo.email': 1 });
caseSchema.index({ 'clientInfo.mobile': 1 });
caseSchema.index({ createdAt: -1 });

caseSchema.virtual('clientAge').get(function () {
  if (!this.clientInfo.dateOfBirth) return null;
  const ageDiff = Date.now() - this.clientInfo.dateOfBirth.getTime();
  const ageDate = new Date(ageDiff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
});

caseSchema.methods.addStatus = function (newStatus, updatedBy, notes) {
  this.statusHistory.push({
    status: newStatus,
    updatedBy,
    notes,
    timestamp: new Date(),
  });
  this.currentStatus = newStatus;
  return this.save();
};

caseSchema.methods.calculateDBR = function () {
  const totalMonthlyIncome = this.incomeDetails.totalMonthlyIncome;
  const totalMonthlyLiabilities = this.expenseDetails.totalMonthlyLiabilities;
  const dbr = (totalMonthlyLiabilities / totalMonthlyIncome) * 100;
  this.expenseDetails.dbrPercentage = dbr;
  this.expenseDetails.dbrStatus = dbr <= 50 ? 'Eligible' : dbr <= 60 ? 'Borderline' : 'Ineligible';
  return this.save();
};

const Case = mongoose.models.Case || mongoose.model('Case', caseSchema);
module.exports = Case;