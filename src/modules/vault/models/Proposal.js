const mongoose = require('mongoose');
const crypto = require('crypto');

// Reference to Bank Product (from BankProduct master)
const selectedBankProductSchema = new mongoose.Schema(
  {
    bankProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankMortgageProduct', required: true },
    bankName: { type: String, required: true },  // ✅ ADDED: Store bank name for quick access
    snapshotRate: { type: Number, required: true },
    snapshotFeatures: [{ type: String }],
    snapshotMaxLtv: { type: Number, required: true },
    
    // ✅ ADDED: Calculated financial fields (LOW priority but good to have)
    snapshotEmi: { type: Number, default: null },
    snapshotMonthlyPayment: { type: Number, default: null },
    snapshotTotalUpfrontCost: { type: Number, default: null },
    snapshotDbr: { type: Number, default: null },
    snapshotLoanAmount: { type: Number, default: null },
    snapshotLtv: { type: Number, default: null },
    snapshotTenureYears: { type: Number, default: 25 },
    snapshotProcessingFee: { type: Number, default: 0 },
    snapshotValuationFee: { type: Number, default: 2500 },
  },
  { _id: false }
);

const proposalSchema = new mongoose.Schema(
  {
    // Reference to Lead (source of truth)
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'VaultLead', required: true },

    // Who created this proposal
    createdBy: {
      role: { type: String, enum: ['Admin', 'Partner', 'Agent'], required: true },
      userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      userName: { type: String, required: true },
      partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', default: null },
      createdAt: { type: Date, default: Date.now },
    },

    // Client requirements (copied from lead at proposal time)
    clientRequirements: {
      targetPropertyValue: { type: Number, required: true },
      preferredLoanTenureYears: { type: Number, required: true },
      propertyType: { type: String, enum: ['Ready', 'Off-plan', 'Commercial'], required: true },
      feeFinancingPreference: { type: Boolean, default: true },
      bankPreferences: [{ type: String }],
      bankExclusions: [{ type: String }],
    },

    // ✅ ADDED: Customer financial summary (snapshot at proposal time)
    customerFinancialSummary: {
      monthlySalary: { type: Number, default: null },
      estimatedLoanAmount: { type: Number, default: null },
      estimatedDbr: { type: Number, default: null },
      estimatedLtv: { type: Number, default: null },
      eligibilityStatus: { 
        type: String, 
        enum: ['Eligible', 'Borderline', 'Not Eligible'], 
        default: 'Eligible' 
      }
    },

    // Selected Bank Products (references to BankProduct master)
    selectedBankProducts: [selectedBankProductSchema],

    // ✅ ADDED: Bank comparison summary (for quick display)
    bankComparison: {
      bestRateBank: { type: String, default: null },
      bestRate: { type: Number, default: null },
      lowestEmiBank: { type: String, default: null },
      lowestEmi: { type: Number, default: null },
      lowestUpfrontBank: { type: String, default: null },
      lowestUpfront: { type: Number, default: null },
      recommendedBank: { type: String, default: null }
    },

    // Notes
    coverNote: { type: String, default: null },
    internalNotes: { type: String, default: null },

    // Status
    status: {
      type: String,
      enum: ['Draft', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired'],
      default: 'Draft',
    },

    // PDF & Links
    pdfUrl: { type: String, default: null },
    secureLink: { type: String, unique: true, sparse: true },
    secureLinkExpiry: { type: Date, default: null },
    fullSecureLink: { type: String, default: null },

    // Tracking
    sentAt: { type: Date, default: null },
    sentTo: { type: String, default: null },
    viewedAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    expiredAt: { type: Date, default: null },

    // Case Conversion
    convertedToCase: { type: Boolean, default: false },
    convertedCaseId: { type: String, default: null },
    convertedCaseReference: { type: String, default: null },
    convertedAt: { type: Date, default: null },

    // PDF Generation
    pdfGenerationStatus: {
      type: String,
      enum: ['pending', 'generating', 'completed', 'failed'],
      default: 'pending',
    },
    pdfGenerationFailedReason: { type: String, default: null },

    // Version Control
    version: { type: Number, default: 1 },
    previousVersionId: { type: String, default: null },

    // Expiry
    expiryDays: { type: Number, default: 30 },
    expiresAt: { type: Date, default: null },

    // Soft Delete
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

// ==================== INDEXES ====================
proposalSchema.index({ leadId: 1 });
proposalSchema.index({ secureLink: 1 }, { unique: true, sparse: true });
proposalSchema.index({ 'createdBy.userId': 1 });
proposalSchema.index({ status: 1 });
proposalSchema.index({ createdAt: -1 });
proposalSchema.index({ convertedToCase: 1 });

// ==================== VIRTUALS ====================
proposalSchema.virtual('proposalId').get(function () {
  return this._id.toString();
});

proposalSchema.virtual('isExpired').get(function () {
  return this.expiresAt && new Date() > this.expiresAt;
});

// ==================== HELPER FUNCTIONS ====================
function calculateEMI(principal, annualRate, tenureYears) {
  const monthlyRate = annualRate / 100 / 12;
  const months = tenureYears * 12;
  if (monthlyRate === 0) return principal / months;
  const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, months) / 
              (Math.pow(1 + monthlyRate, months) - 1);
  return Math.round(emi);
}

function calculateDBR(emi, monthlySalary, nationality) {
  const dbr = (emi / monthlySalary) * 100;
  const isUAE = nationality === 'United Arab Emirates' || nationality === 'UAE';
  const maxDBR = isUAE ? 55 : 50;
  return {
    dbr: Math.round(dbr * 100) / 100,
    isEligible: dbr <= maxDBR,
    maxAllowed: maxDBR
  };
}

// ==================== METHODS ====================
proposalSchema.methods.send = function (clientEmail) {
  this.status = 'Sent';
  this.sentAt = new Date();
  this.sentTo = clientEmail;
  if (!this.expiresAt) {
    this.expiresAt = new Date();
    this.expiresAt.setDate(this.expiresAt.getDate() + this.expiryDays);
  }
  return this.save();
};

proposalSchema.methods.generateSecureLink = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.secureLink = token;
  this.secureLinkExpiry = new Date();
  this.secureLinkExpiry.setDate(this.secureLinkExpiry.getDate() + 7);
  return this.save();
};

proposalSchema.methods.accept = function () {
  this.status = 'Accepted';
  this.acceptedAt = new Date();
  return this.save();
};

proposalSchema.methods.reject = function (reason) {
  this.status = 'Rejected';
  this.rejectedAt = new Date();
  this.rejectionReason = reason;
  return this.save();
};

proposalSchema.methods.markViewed = function () {
  if (!this.viewedAt) {
    this.viewedAt = new Date();
    this.status = 'Viewed';
  }
  return this.save();
};

proposalSchema.methods.convertToCase = function (caseId, caseReference) {
  this.convertedToCase = true;
  this.convertedCaseId = caseId;
  this.convertedCaseReference = caseReference;
  this.convertedAt = new Date();
  return this.save();
};

// Get client info from lead
proposalSchema.methods.getClientInfo = async function () {
  const Lead = mongoose.model('VaultLead');
  const lead = await Lead.findById(this.leadId);
  if (!lead) return null;
  
  const calculateAge = (dob) => {
    if (!dob) return null;
    const ageDiff = Date.now() - new Date(dob).getTime();
    const ageDate = new Date(ageDiff);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
  };
  
  return {
    name: lead.customerInfo.fullName,
    email: lead.customerInfo.email,
    phone: lead.customerInfo.mobileNumber,
    monthlySalary: lead.customerInfo.monthlySalary,
    nationality: lead.customerInfo.nationality,
    age: calculateAge(lead.customerInfo.dateOfBirth),
    propertyValue: lead.propertyDetails.propertyValue,
    propertyType: lead.propertyDetails.propertyType,
  };
};

// ==================== STATIC METHODS ====================
proposalSchema.statics.createFromLead = async function (leadId, selectedBankProducts, coverNote, userInfo, customCalculations = null) {
  const Lead = mongoose.model('VaultLead');
  const lead = await Lead.findById(leadId);
  
  if (!lead) throw new Error('Lead not found');
  if (lead.currentStatus !== 'Qualified') {
    throw new Error(`Lead status must be Qualified. Current: ${lead.currentStatus}`);
  }
  
  const existingProposal = await this.findOne({ leadId, isDeleted: false });
  if (existingProposal) throw new Error('A proposal already exists for this lead');
  
  // Get lead data for calculations
  const monthlySalary = lead.customerInfo.monthlySalary || 0;
  const propertyValue = lead.propertyDetails.propertyValue;
  const downPayment = lead.propertyDetails.downPaymentAmount || 0;
  const loanAmount = propertyValue - downPayment;
  const ltv = (loanAmount / propertyValue) * 100;
  const tenureYears = lead.loanRequirements.preferredTenureYears || 25;
  const nationality = lead.customerInfo.nationality;
  
  // Calculate DBR limits
  const isUAE = nationality === 'United Arab Emirates' || nationality === 'UAE';
  const maxDBR = isUAE ? 55 : 50;
  let eligibilityStatus = 'Eligible';
  
  // Process selected bank products with calculations
  const processedBankProducts = [];
  let bestRate = Infinity;
  let bestRateBank = null;
  let lowestEmi = Infinity;
  let lowestEmiBank = null;
  let lowestUpfront = Infinity;
  let lowestUpfrontBank = null;
  
  for (const product of selectedBankProducts) {
    // Get bank name from product or from database
    let bankName = product.bankName;
    if (!bankName && product.bankProductId) {
      const BankProduct = mongoose.model('BankMortgageProduct');
      const bankProduct = await BankProduct.findById(product.bankProductId);
      bankName = bankProduct?.bankInfo?.bankName || 'Unknown Bank';
    }
    
    const emi = calculateEMI(loanAmount, product.snapshotRate, tenureYears);
    const dbrResult = monthlySalary > 0 ? calculateDBR(emi, monthlySalary, nationality) : { dbr: 0, isEligible: true };
    const totalUpfront = customCalculations?.upfrontCosts?.[product.bankProductId] || 0;
    
    processedBankProducts.push({
      bankProductId: product.bankProductId,
      bankName: bankName,
      snapshotRate: product.snapshotRate,
      snapshotFeatures: product.snapshotFeatures || [],
      snapshotMaxLtv: product.snapshotMaxLtv,
      snapshotEmi: emi,
      snapshotMonthlyPayment: emi,
      snapshotTotalUpfrontCost: totalUpfront,
      snapshotDbr: dbrResult.dbr,
      snapshotLoanAmount: loanAmount,
      snapshotLtv: Math.round(ltv),
      snapshotTenureYears: tenureYears,
      snapshotProcessingFee: product.snapshotProcessingFee || 0,
      snapshotValuationFee: product.snapshotValuationFee || 2500,
    });
    
    // Update best values
    if (product.snapshotRate < bestRate) {
      bestRate = product.snapshotRate;
      bestRateBank = bankName;
    }
    if (emi < lowestEmi) {
      lowestEmi = emi;
      lowestEmiBank = bankName;
    }
    if (totalUpfront < lowestUpfront) {
      lowestUpfront = totalUpfront;
      lowestUpfrontBank = bankName;
    }
  }
  
  // Determine overall eligibility
  const estimatedDbr = monthlySalary > 0 ? (lowestEmi / monthlySalary) * 100 : 0;
  if (estimatedDbr > maxDBR) eligibilityStatus = 'Not Eligible';
  else if (estimatedDbr > maxDBR - 5) eligibilityStatus = 'Borderline';
  
  const proposal = await this.create({
    leadId,
    createdBy: {
      role: userInfo.userRole,
      userId: userInfo.userId,
      userName: userInfo.userName,
      partnerId: userInfo.partnerId || null,
      createdAt: new Date(),
    },
    clientRequirements: {
      targetPropertyValue: propertyValue,
      preferredLoanTenureYears: tenureYears,
      propertyType: lead.propertyDetails.propertyType,
      feeFinancingPreference: true,
      bankPreferences: [],
      bankExclusions: [],
    },
    customerFinancialSummary: {
      monthlySalary,
      estimatedLoanAmount: loanAmount,
      estimatedDbr: Math.round(estimatedDbr * 100) / 100,
      estimatedLtv: Math.round(ltv),
      eligibilityStatus
    },
    selectedBankProducts: processedBankProducts,
    bankComparison: {
      bestRateBank,
      bestRate,
      lowestEmiBank,
      lowestEmi,
      lowestUpfrontBank,
      lowestUpfront,
      recommendedBank: bestRateBank
    },
    coverNote: coverNote || null,
    status: 'Draft',
  });
  
  // Update lead with proposal reference
  lead.conversionInfo.proposalId = proposal._id;
  await lead.save();
  
  return proposal;
};

// ==================== PRE-SAVE MIDDLEWARE ====================
proposalSchema.pre('save', function (next) {
  if (!this.expiresAt && this.status === 'Sent') {
    this.expiresAt = new Date();
    this.expiresAt.setDate(this.expiresAt.getDate() + this.expiryDays);
  }
  
  if (this.selectedBankProducts.length > 3) {
    const error = new Error('Maximum 3 bank products can be selected');
    return next(error);
  }
  
  next();
});

// ==================== JSON CONFIGURATION ====================
proposalSchema.set('toJSON', { virtuals: true });
proposalSchema.set('toObject', { virtuals: true });

const Proposal = mongoose.models.Proposal || mongoose.model('Proposal', proposalSchema);
module.exports = Proposal;