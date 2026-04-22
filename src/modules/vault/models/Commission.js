const mongoose = require('mongoose');
const crypto = require('crypto');

const commissionSchema = new mongoose.Schema(
  {
    commissionId: { type: String, unique: true, required: true },
    
    // Case references
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Case', required: true },
    caseReference: { type: String, required: true },  // ✅ ADDED
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'VaultLead', default: null },
    proposalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Proposal', default: null },
    
    // Customer reference (from PRD)
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },  // ✅ ADDED
    customerName: { type: String, default: null },  // ✅ ADDED
    
    // Recipient info
    recipientRole: {
      type: String,
      enum: ['freelance_agent', 'partner'],
      required: true,
    },
    recipientId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'recipientModel' },
    recipientModel: {
      type: String,
      enum: ['VaultAgent', 'Partner'],
      required: true,
    },
    recipientName: { type: String, required: true },
    
    // ✅ ADDED: For tracking which affiliated agent submitted (commission goes to partner)
    sourceAgentId: { type: mongoose.Schema.Types.ObjectId, ref: 'VaultAgent', default: null },
    sourceAgentName: { type: String, default: null },
    
    // Loan details
    loanAmount: { type: Number, required: true },
    loanTier: { type: String, enum: ['≤5M AED', '>5M AED'], required: true },
    
    // Commission calculation
    bankCommissionToXoto: { type: Number, required: true },
    recipientPercentage: { type: Number, required: true },
    commissionAmount: { type: Number, required: true },
    calculationFormula: { type: String, required: true },
    
    // Referral type (for freelance agents)
    referralType: {
      type: String,
      enum: ['Referral Only', 'Referral + Docs', null],
      default: null,
    },
    
    // ✅ ADDED: Source of percentage (for audit)
    percentageSource: {
      type: String,
      enum: [
        'freelance_commission.referralOnly',
        'freelance_commission.referralPlusDocs',
        'partner.commissionConfiguration'
      ],
      default: null
    },
    
    // Status tracking
    status: {
      type: String,
      enum: ['Pending', 'Confirmed', 'Processing', 'Paid', 'Failed'],
      default: 'Pending',
    },
    
    triggerStatus: { type: String, default: 'Disbursed' },
    disbursedAt: { type: Date, required: true },
    
    // Admin actions
    confirmedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    confirmedAt: { type: Date, default: null },
    
    // Payment details
    paymentMethod: { type: String, enum: ['Bank Transfer', 'Wallet', 'Cheque'], default: 'Bank Transfer' },
    paymentReference: { type: String, default: null },
    paymentSentAt: { type: Date, default: null },
    paymentCompletedAt: { type: Date, default: null },
    paymentFailedReason: { type: String, default: null },
    
    // Payout bank details (snapshot at commission time)
    payoutBankDetails: {
      beneficiaryName: { type: String, default: null },
      bankName: { type: String, default: null },
      iban: { type: String, default: null },
      swiftCode: { type: String, default: null },
    },
    
    // Documents
    invoiceNumber: { type: String, default: null },
    invoiceUrl: { type: String, default: null },
    
    // ✅ ADDED: Audit trail
    notes: { type: String, default: null },
    createdBy: {
      role: { type: String, enum: ['system', 'admin'], default: 'system' },
      adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
    },
    
    // Soft delete
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Indexes
commissionSchema.index({ commissionId: 1 }, { unique: true });
commissionSchema.index({ caseId: 1 });
commissionSchema.index({ caseReference: 1 });
commissionSchema.index({ customerId: 1 });
commissionSchema.index({ leadId: 1 });
commissionSchema.index({ recipientRole: 1, recipientId: 1 });
commissionSchema.index({ sourceAgentId: 1 });
commissionSchema.index({ status: 1 });
commissionSchema.index({ createdAt: -1 });
commissionSchema.index({ loanTier: 1 });

// Virtuals
commissionSchema.virtual('formattedCommissionAmount').get(function () {
  return `${this.commissionAmount.toLocaleString()} AED`;
});

commissionSchema.virtual('formattedLoanAmount').get(function () {
  return `${this.loanAmount.toLocaleString()} AED`;
});

// ==================== EXISTING METHODS ====================

commissionSchema.methods.confirm = function (adminId) {
  this.status = 'Confirmed';
  this.confirmedByAdminId = adminId;
  this.confirmedAt = new Date();
  return this.save();
};

commissionSchema.methods.markAsPaid = function (paymentReference, paymentMethod) {
  this.status = 'Paid';
  this.paymentReference = paymentReference;
  this.paymentMethod = paymentMethod || this.paymentMethod;
  this.paymentSentAt = new Date();
  this.paymentCompletedAt = new Date();
  return this.save();
};

commissionSchema.methods.markAsFailed = function (reason) {
  this.status = 'Failed';
  this.paymentFailedReason = reason;
  return this.save();
};

// Static methods
commissionSchema.statics.calculateCommission = function (bankCommissionToXoto, recipientPercentage) {
  const commissionAmount = (bankCommissionToXoto * recipientPercentage) / 100;
  const formula = `${bankCommissionToXoto} × ${recipientPercentage}% = ${commissionAmount}`;
  return { commissionAmount, formula };
};

commissionSchema.statics.getLoanTier = function (loanAmount) {
  return loanAmount <= 5000000 ? '≤5M AED' : '>5M AED';
};

// ==================== NEW METHODS ====================

// ✅ Method: Update recipient's earnings after commission is confirmed/paid
commissionSchema.methods.updateRecipientEarnings = async function() {
  const VaultAgent = mongoose.model('VaultAgent');
  const Partner = mongoose.model('Partner');
  
  if (this.recipientRole === 'freelance_agent') {
    const agent = await VaultAgent.findById(this.recipientId);
    if (agent) {
      await agent.updateEarningsFromCommission(this.commissionAmount, this.status === 'Confirmed');
    }
  } else if (this.recipientRole === 'partner') {
    const partner = await Partner.findById(this.recipientId);
    if (partner) {
      await partner.updateMetricsFromCommission(this.commissionAmount, true);
    }
  }
  
  return this;
};

// ✅ MAIN METHOD: Auto-create commission from Case
commissionSchema.statics.createFromCase = async function(caseData, adminId = null) {
  const VaultAgent = mongoose.model('VaultAgent');
  const Partner = mongoose.model('Partner');
  const Customer = mongoose.model('Customer');
  
  // Check if commission already exists
  const existingCommission = await this.findOne({ caseId: caseData._id, isDeleted: false });
  if (existingCommission) {
    throw new Error(`Commission already exists for case ${caseData.caseReference}`);
  }
  
  const loanAmount = caseData.loanInfo?.approvedAmount || caseData.loanInfo?.requestedAmount || 0;
  const loanTier = this.getLoanTier(loanAmount);
  const bankCommissionToXoto = loanAmount * 0.01; // Example: 1% of loan amount
  
  // Get customer info
  let customerName = null;
  if (caseData.customerId) {
    const customer = await Customer.findById(caseData.customerId);
    customerName = customer ? `${customer.name?.first_name} ${customer.name?.last_name}` : null;
  }
  
  let commissionsCreated = [];
  
  // CASE 1: Created by Partner directly
  if (caseData.createdBy?.role === 'partner') {
    const partner = await Partner.findById(caseData.createdBy.partnerId);
    if (!partner) throw new Error('Partner not found');
    
    const eligibility = partner.getCommissionEligibilityStatus();
    if (!eligibility.eligible) {
      throw new Error(`Partner not eligible: ${eligibility.reason}`);
    }
    
    const partnerPercentage = partner.getCommissionPercentage(loanAmount);
    const { commissionAmount, formula } = this.calculateCommission(bankCommissionToXoto, partnerPercentage);
    
    const commission = await this.create({
      commissionId: `COM-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      caseId: caseData._id,
      caseReference: caseData.caseReference,
      leadId: caseData.sourceLeadId,
      proposalId: caseData.proposalId,
      customerId: caseData.customerId,
      customerName: customerName,
      recipientRole: 'partner',
      recipientId: partner._id,
      recipientModel: 'Partner',
      recipientName: partner.displayName || partner.companyName,
      loanAmount,
      loanTier,
      bankCommissionToXoto,
      recipientPercentage: partnerPercentage,
      commissionAmount,
      calculationFormula: formula,
      percentageSource: 'partner.commissionConfiguration',
      disbursedAt: new Date(),
      payoutBankDetails: partner.getPayoutBankDetails(),
      createdBy: adminId ? { role: 'admin', adminId } : { role: 'system' }
    });
    
    // Update partner metrics
    await partner.updateMetricsFromCommission(commissionAmount);
    commissionsCreated.push(commission);
  }
  
  // CASE 2: Created by Agent (Freelance or Partner-Affiliated)
  else if (caseData.createdBy?.role === 'agent') {
    const agent = await VaultAgent.findById(caseData.createdBy.userId);
    if (!agent) throw new Error('Agent not found');
    
    // Get referral type from lead if available
    let referralType = null;
    let percentageSource = null;
    let recipientPercentage = null;
    
    if (caseData.sourceLeadId) {
      const Lead = mongoose.model('VaultLead');
      const lead = await Lead.findById(caseData.sourceLeadId);
      referralType = lead?.referralType || 'Referral Only';
    }
    
    if (agent.agentType === 'FreelanceAgent') {
      // Freelance Agent gets commission directly
      const eligibility = agent.getCommissionEligibilityStatus();
      if (!eligibility.eligible) {
        throw new Error(`Agent not eligible: ${eligibility.reason}`);
      }
      
      recipientPercentage = agent.getCommissionPercentage(loanAmount, referralType);
      percentageSource = referralType === 'Referral Only' 
        ? 'freelance_commission.referralOnly' 
        : 'freelance_commission.referralPlusDocs';
      
      const { commissionAmount, formula } = this.calculateCommission(bankCommissionToXoto, recipientPercentage);
      
      const commission = await this.create({
        commissionId: `COM-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        caseId: caseData._id,
        caseReference: caseData.caseReference,
        leadId: caseData.sourceLeadId,
        proposalId: caseData.proposalId,
        customerId: caseData.customerId,
        customerName: customerName,
        recipientRole: 'freelance_agent',
        recipientId: agent._id,
        recipientModel: 'VaultAgent',
        recipientName: agent.fullName,
        sourceAgentId: agent._id,
        sourceAgentName: agent.fullName,
        loanAmount,
        loanTier,
        bankCommissionToXoto,
        recipientPercentage,
        commissionAmount,
        calculationFormula: formula,
        referralType,
        percentageSource,
        disbursedAt: new Date(),
        payoutBankDetails: agent.getPayoutBankDetails(),
        createdBy: adminId ? { role: 'admin', adminId } : { role: 'system' }
      });
      
      // Update agent earnings
      await agent.updateEarningsFromCommission(commissionAmount);
      commissionsCreated.push(commission);
      
    } else if (agent.agentType === 'PartnerAffiliatedAgent') {
      // Partner-Affiliated Agent - commission goes to Partner
      const partner = await Partner.findById(agent.partnerId);
      if (!partner) throw new Error('Partner not found for affiliated agent');
      
      const eligibility = partner.getCommissionEligibilityStatus();
      if (!eligibility.eligible) {
        throw new Error(`Partner not eligible: ${eligibility.reason}`);
      }
      
      recipientPercentage = partner.getCommissionPercentage(loanAmount);
      percentageSource = 'partner.commissionConfiguration';
      
      const { commissionAmount, formula } = this.calculateCommission(bankCommissionToXoto, recipientPercentage);
      
      const commission = await this.create({
        commissionId: `COM-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        caseId: caseData._id,
        caseReference: caseData.caseReference,
        leadId: caseData.sourceLeadId,
        proposalId: caseData.proposalId,
        customerId: caseData.customerId,
        customerName: customerName,
        recipientRole: 'partner',
        recipientId: partner._id,
        recipientModel: 'Partner',
        recipientName: partner.displayName || partner.companyName,
        sourceAgentId: agent._id,
        sourceAgentName: agent.fullName,
        loanAmount,
        loanTier,
        bankCommissionToXoto,
        recipientPercentage,
        commissionAmount,
        calculationFormula: formula,
        percentageSource,
        disbursedAt: new Date(),
        payoutBankDetails: partner.getPayoutBankDetails(),
        createdBy: adminId ? { role: 'admin', adminId } : { role: 'system' }
      });
      
      // Update partner metrics
      await partner.updateMetricsFromCommission(commissionAmount);
      commissionsCreated.push(commission);
    }
  }
  
  return commissionsCreated;
};

// ✅ Method: Get commission summary for recipient
commissionSchema.statics.getSummaryForRecipient = async function(recipientId, recipientRole, startDate, endDate) {
  const matchQuery = {
    recipientId,
    recipientRole,
    isDeleted: false
  };
  
  if (startDate || endDate) {
    matchQuery.createdAt = {};
    if (startDate) matchQuery.createdAt.$gte = startDate;
    if (endDate) matchQuery.createdAt.$lte = endDate;
  }
  
  const summary = await this.aggregate([
    { $match: matchQuery },
    { $group: {
      _id: '$status',
      totalAmount: { $sum: '$commissionAmount' },
      count: { $sum: 1 }
    }}
  ]);
  
  const result = {
    totalEarned: 0,
    pending: 0,
    confirmed: 0,
    paid: 0,
    failed: 0,
    totalCount: 0
  };
  
  summary.forEach(item => {
    const key = item._id.toLowerCase();
    if (key === 'pending') result.pending = item.totalAmount;
    else if (key === 'confirmed') result.confirmed = item.totalAmount;
    else if (key === 'paid') result.paid = item.totalAmount;
    else if (key === 'failed') result.failed = item.totalAmount;
    result.totalEarned += item.totalAmount;
    result.totalCount += item.count;
  });
  
  return result;
};

// Pre-save middleware
commissionSchema.pre('save', function(next) {
  // Validate commission amount is positive
  if (this.commissionAmount <= 0) {
    return next(new Error('Commission amount must be greater than 0'));
  }
  
  // Validate percentage is within range
  if (this.recipientPercentage < 0 || this.recipientPercentage > 100) {
    return next(new Error('Commission percentage must be between 0 and 100'));
  }
  
  next();
});

// Ensure virtuals are included
commissionSchema.set('toJSON', { virtuals: true });
commissionSchema.set('toObject', { virtuals: true });

const Commission = mongoose.models.Commission || mongoose.model('Commission', commissionSchema);
module.exports = Commission;