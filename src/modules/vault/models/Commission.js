import mongoose from 'mongoose';
import crypto from 'crypto';

// ══════════════════════════════════════════════════════════════════
// COMMISSION MODEL
//
// PRD Commission Structure:
//   FreelanceAgent (Referral Partner):
//     ≤5M AED loan → 40% of Xoto's commission
//     >5M AED loan → 50% of Xoto's commission
//
//   Partner (company):
//     ≤5M AED loan → 80% of Xoto's commission
//     >5M AED loan → 85% of Xoto's commission
//
//   PartnerAffiliatedAgent:
//     Commission goes to Partner — NOT the agent directly
//
//   Admin/Website leads:
//     No commission paid - Xoto keeps 100%
// ══════════════════════════════════════════════════════════════════

const commissionSchema = new mongoose.Schema(
  {
    // ── Unique ID ────────────────────────────────────────────────
    commissionId: { type: String, unique: true, required: true },

    // ── References ───────────────────────────────────────────────
    caseId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Case', required: true },
    caseReference: { type: String, required: true },
    leadId:        { type: mongoose.Schema.Types.ObjectId, ref: 'VaultLead', default: null },
    proposalId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Proposal', default: null },
    customerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName:  { type: String, default: null },

    // ── Who receives this commission ─────────────────────────────
    // freelance_agent → FreelanceAgent (Referral Partner) earns directly
    // partner → Partner company earns (whether lead was from partner or affiliated agent)
    // internal → No payout (Admin/Website leads)
    recipientRole: {
      type: String,
      enum: ['freelance_agent', 'partner', 'internal'],
      required: true,
    },
    recipientId:    { type: mongoose.Schema.Types.ObjectId, refPath: 'recipientModel', default: null },
    recipientModel: { type: String, enum: ['VaultAgent', 'Partner', null], default: null },
    recipientName:  { type: String, required: true },

    // ── Source agent (if PartnerAffiliatedAgent submitted lead) ──
    // Commission still goes to partner — but we track which agent submitted
    sourceAgentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'VaultAgent', default: null },
    sourceAgentName: { type: String, default: null },

    // ── Lead source tracking ─────────────────────────────────────
    leadSource: {
      type: String,
      enum: ['freelance_agent', 'partner_affiliated_agent', 'individual_partner', 'website', 'admin'],
      default: null
    },
    isInternal: { type: Boolean, default: false }, // true for website/admin leads

    // ── Loan details ─────────────────────────────────────────────
    loanAmount: { type: Number, required: true },
    loanTier:   { type: String, enum: ['≤5M AED', '>5M AED'], required: true },

    // ── Commission calculation ───────────────────────────────────
    bankCommissionToXoto: { type: Number, required: true },
    recipientPercentage:  { type: Number, required: true, default: 0 },
    commissionAmount:     { type: Number, required: true, default: 0 },
    calculationFormula:   { type: String, required: true },

    // ── PRD: only Referral Only — no referralPlusDocs ───────────
    referralType: {
      type: String,
      enum: ['Referral Only', null],
      default: null,
    },

    // ── Which config was used to get the percentage ──────────────
    percentageSource: {
      type: String,
      enum: [
        'freelance_commission.referralOnly',
        'partner.commissionConfiguration',
        'internal'
      ],
      default: null,
    },

    // ── Status ───────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['Pending', 'Confirmed', 'Processing', 'Paid', 'Failed', 'Completed'],
      default: 'Pending',
    },

    triggerStatus: { type: String, default: 'Disbursed' },
    disbursedAt:   { type: Date, required: true },

    // ── Admin actions ────────────────────────────────────────────
    confirmedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    confirmedAt:        { type: Date, default: null },

    // ── Payment details ──────────────────────────────────────────
    paymentMethod:       { type: String, enum: ['Bank Transfer', 'Wallet', 'Cheque'], default: 'Bank Transfer' },
    paymentReference:    { type: String, default: null },
    paymentSentAt:       { type: Date, default: null },
    paymentCompletedAt:  { type: Date, default: null },
    paymentFailedReason: { type: String, default: null },

    // ── Payout bank snapshot ─────────────────────────────────────
    payoutBankDetails: {
      beneficiaryName: { type: String, default: null },
      bankName:        { type: String, default: null },
      iban:            { type: String, default: null },
      swiftCode:       { type: String, default: null },
    },

    // ── Xoto Earnings (for internal tracking) ────────────────────
    xotoEarnings: {
      amount: { type: Number, default: 0 },
      rate: { type: String, default: '1%' },
      calculation: { type: String, default: null },
      note: { type: String, default: null }
    },

    // ── Invoice ──────────────────────────────────────────────────
    invoiceNumber: { type: String, default: null },
    invoiceUrl:    { type: String, default: null },

    // ── Audit ────────────────────────────────────────────────────
    notes: { type: String, default: null },
    createdBy: {
      role:    { type: String, enum: ['system', 'admin'], default: 'system' },
      adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ══════════════════════════════════════════════════════════════════
// INDEXES
// ══════════════════════════════════════════════════════════════════
commissionSchema.index({ commissionId: 1 }, { unique: true });
commissionSchema.index({ caseId: 1 });
commissionSchema.index({ caseReference: 1 });
commissionSchema.index({ customerId: 1 });
commissionSchema.index({ leadId: 1 });
commissionSchema.index({ recipientRole: 1, recipientId: 1 });
commissionSchema.index({ sourceAgentId: 1 });
commissionSchema.index({ status: 1 });
commissionSchema.index({ loanTier: 1 });
commissionSchema.index({ leadSource: 1 });
commissionSchema.index({ isInternal: 1 });
commissionSchema.index({ createdAt: -1 });

// ══════════════════════════════════════════════════════════════════
// VIRTUALS
// ══════════════════════════════════════════════════════════════════
commissionSchema.virtual('formattedCommissionAmount').get(function () {
  return `AED ${this.commissionAmount.toLocaleString()}`;
});

commissionSchema.virtual('formattedLoanAmount').get(function () {
  return `AED ${this.loanAmount.toLocaleString()}`;
});

commissionSchema.virtual('xotoNetProfit').get(function () {
  return this.bankCommissionToXoto - this.commissionAmount;
});

commissionSchema.virtual('isPayoutRequired').get(function () {
  return this.recipientRole !== 'internal' && this.commissionAmount > 0;
});

// ══════════════════════════════════════════════════════════════════
// INSTANCE METHODS
// ══════════════════════════════════════════════════════════════════

commissionSchema.methods.confirm = function (adminId) {
  if (this.recipientRole === 'internal') {
    this.status = 'Completed';
  } else {
    this.status = 'Confirmed';
  }
  this.confirmedByAdminId = adminId;
  this.confirmedAt = new Date();
  return this.save();
};

commissionSchema.methods.markAsPaid = function (paymentReference, paymentMethod) {
  if (this.recipientRole === 'internal') {
    this.status = 'Completed';
  } else {
    this.status = 'Paid';
  }
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

commissionSchema.methods.updateRecipientEarnings = async function () {
  if (this.recipientRole === 'internal') return this;
  
  const VaultAgent = mongoose.model('VaultAgent');
  const Partner = mongoose.model('Partner');

  if (this.recipientRole === 'freelance_agent') {
    const agent = await VaultAgent.findById(this.recipientId);
    if (agent) {
      await agent.updateEarningsFromCommission(this.commissionAmount, this.status === 'Confirmed');
    }
  } else if (this.recipientRole === 'partner') {
    const partner = await Partner.findById(this.recipientId);
    if (partner && typeof partner.updateMetricsFromCommission === 'function') {
      await partner.updateMetricsFromCommission(this.commissionAmount, true);
    }
  }
  return this;
};

// ══════════════════════════════════════════════════════════════════
// STATIC METHODS
// ══════════════════════════════════════════════════════════════════

commissionSchema.statics.calculateCommission = function (bankCommissionToXoto, recipientPercentage) {
  const commissionAmount = Math.round((bankCommissionToXoto * recipientPercentage) / 100);
  const formula = `${bankCommissionToXoto.toLocaleString()} × ${recipientPercentage}% = ${commissionAmount.toLocaleString()}`;
  return { commissionAmount, formula };
};

commissionSchema.statics.getLoanTier = function (loanAmount) {
  return loanAmount <= 5000000 ? '≤5M AED' : '>5M AED';
};

commissionSchema.statics.getRecipientPercentage = function (leadSourceRole, loanAmount) {
  if (leadSourceRole === 'freelance_agent') {
    return loanAmount <= 5000000 ? 40 : 50;
  }
  if (leadSourceRole === 'partner_affiliated_agent' || leadSourceRole === 'individual_partner') {
    return loanAmount <= 5000000 ? 80 : 85;
  }
  return 0;
};

// ── CREATE INTERNAL COMMISSION (Website/Admin leads) ──────────────
commissionSchema.statics.createInternalCommission = async function (caseData, xotoCommission, adminId = null) {
  const commissionId = `INT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  
  const commission = await this.create({
    commissionId,
    caseId: caseData._id,
    caseReference: caseData.caseReference,
    leadId: caseData.sourceLeadId,
    proposalId: caseData.proposalId,
    customerId: caseData.customerId,
    customerName: caseData.clientInfo?.fullName,
    recipientRole: 'internal',
    recipientId: null,
    recipientModel: null,
    recipientName: 'Xoto (Internal)',
    leadSource: caseData.leadSource || 'admin',
    isInternal: true,
    loanAmount: caseData.disbursementInfo?.disbursedAmount || 0,
    loanTier: this.getLoanTier(caseData.disbursementInfo?.disbursedAmount || 0),
    bankCommissionToXoto: xotoCommission,
    recipientPercentage: 0,
    commissionAmount: 0,
    calculationFormula: `${xotoCommission.toLocaleString()} × 0% = 0 AED`,
    percentageSource: 'internal',
    status: 'Completed',
    disbursedAt: new Date(),
    xotoEarnings: {
      amount: xotoCommission,
      rate: '1%',
      calculation: `${(caseData.disbursementInfo?.disbursedAmount || 0).toLocaleString()} × 1% = ${xotoCommission.toLocaleString()} AED`,
      note: `Lead from ${caseData.leadSource || 'unknown source'}. No commission paid.`
    },
    createdBy: adminId ? { role: 'admin', adminId } : { role: 'system' },
    notes: `Internal commission record. Xoto earned ${xotoCommission.toLocaleString()} AED (1% of loan). No payout required.`
  });
  
  return commission;
};

// ── Main static method ─────────────────────────────────────────
commissionSchema.statics.createFromCase = async function (caseData, adminId = null) {
  const VaultAgent = mongoose.model('VaultAgent');
  const Partner = mongoose.model('Partner');
  const Lead = mongoose.model('VaultLead');

  // Prevent duplicate commission for same case
  const existing = await this.findOne({ caseId: caseData._id, isDeleted: false });
  if (existing) {
    throw new Error(`Commission already exists for case ${caseData.caseReference}`);
  }

  const loanAmount = caseData.disbursementInfo?.disbursedAmount
    || caseData.amountTracking?.disbursedAmount
    || caseData.propertyInfo?.loanAmount
    || 0;

  if (!loanAmount || loanAmount <= 0) {
    throw new Error('Disbursed amount is required to create commission');
  }

  const bankCommissionToXoto = Math.round(loanAmount * 0.01);
  
  // Get lead source
  const lead = await Lead.findById(caseData.sourceLeadId);
  let leadSourceRole = null;
  let leadSourceId = null;
  
  if (lead && lead.sourceInfo) {
    leadSourceRole = lead.sourceInfo.createdByRole;
    leadSourceId = lead.sourceInfo.createdById;
  }

  // ==================== INTERNAL LEADS (Website/Admin) ====================
  if (!leadSourceRole || leadSourceRole === 'website' || leadSourceRole === 'admin') {
    return await this.createInternalCommission(caseData, bankCommissionToXoto, adminId);
  }

  // ==================== EXTERNAL LEADS (Has recipient) ====================
  let recipientInfo = null;
  
  // CASE 1: Freelance Agent
  if (leadSourceRole === 'freelance_agent') {
    const agent = await VaultAgent.findById(leadSourceId);
    if (agent && agent.agentType === 'FreelanceAgent') {
      const recipientPercentage = loanAmount <= 5000000 ? 40 : 50;
      const { commissionAmount, formula } = this.calculateCommission(bankCommissionToXoto, recipientPercentage);
      
      recipientInfo = {
        recipientRole: 'freelance_agent',
        recipientId: agent._id,
        recipientModel: 'VaultAgent',
        recipientName: agent.fullName,
        recipientPercentage: recipientPercentage,
        commissionAmount: commissionAmount,
        calculationFormula: formula,
        percentageSource: 'freelance_commission.referralOnly',
        sourceAgentId: agent._id,
        sourceAgentName: agent.fullName,
        payoutBankDetails: agent.bankDetails?.iban ? {
          beneficiaryName: agent.bankDetails.beneficiaryName || agent.fullName,
          bankName: agent.bankDetails.bankName,
          iban: agent.bankDetails.iban,
          swiftCode: agent.bankDetails.swiftCode
        } : {}
      };
    }
  }
  
  // CASE 2: Partner-Affiliated Agent (Commission to Partner)
  else if (leadSourceRole === 'partner_affiliated_agent') {
    const agent = await VaultAgent.findById(leadSourceId);
    if (agent && agent.partnerId) {
      const partner = await Partner.findById(agent.partnerId);
      if (partner) {
        const recipientPercentage = loanAmount <= 5000000 ? 80 : 85;
        const { commissionAmount, formula } = this.calculateCommission(bankCommissionToXoto, recipientPercentage);
        
        recipientInfo = {
          recipientRole: 'partner',
          recipientId: partner._id,
          recipientModel: 'Partner',
          recipientName: partner.displayName || partner.companyName,
          recipientPercentage: recipientPercentage,
          commissionAmount: commissionAmount,
          calculationFormula: formula,
          percentageSource: 'partner.commissionConfiguration',
          sourceAgentId: agent._id,
          sourceAgentName: agent.fullName,
          payoutBankDetails: partner.bankDetails?.iban ? {
            beneficiaryName: partner.bankDetails.beneficiaryName || partner.displayName,
            bankName: partner.bankDetails.bankName,
            iban: partner.bankDetails.iban,
            swiftCode: partner.bankDetails.swiftCode
          } : {}
        };
      }
    }
  }
  
  // CASE 3: Individual Partner
  else if (leadSourceRole === 'individual_partner') {
    const partner = await Partner.findById(leadSourceId);
    if (partner) {
      const recipientPercentage = loanAmount <= 5000000 ? 80 : 85;
      const { commissionAmount, formula } = this.calculateCommission(bankCommissionToXoto, recipientPercentage);
      
      recipientInfo = {
        recipientRole: 'partner',
        recipientId: partner._id,
        recipientModel: 'Partner',
        recipientName: partner.displayName,
        recipientPercentage: recipientPercentage,
        commissionAmount: commissionAmount,
        calculationFormula: formula,
        percentageSource: 'partner.commissionConfiguration',
        payoutBankDetails: partner.bankDetails?.iban ? {
          beneficiaryName: partner.bankDetails.beneficiaryName || partner.displayName,
          bankName: partner.bankDetails.bankName,
          iban: partner.bankDetails.iban,
          swiftCode: partner.bankDetails.swiftCode
        } : {}
      };
    }
  }
  
  // If no valid recipient found, create internal commission
  if (!recipientInfo || !recipientInfo.recipientId) {
    return await this.createInternalCommission(caseData, bankCommissionToXoto, adminId);
  }
  
  // Create external commission record
  const commissionId = `COM-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  
  const commission = await this.create({
    commissionId,
    caseId: caseData._id,
    caseReference: caseData.caseReference,
    leadId: caseData.sourceLeadId,
    proposalId: caseData.proposalId,
    customerId: caseData.customerId,
    customerName: caseData.clientInfo?.fullName,
    leadSource: leadSourceRole,
    isInternal: false,
    recipientRole: recipientInfo.recipientRole,
    recipientId: recipientInfo.recipientId,
    recipientModel: recipientInfo.recipientModel,
    recipientName: recipientInfo.recipientName,
    sourceAgentId: recipientInfo.sourceAgentId || null,
    sourceAgentName: recipientInfo.sourceAgentName || null,
    loanAmount,
    loanTier: this.getLoanTier(loanAmount),
    bankCommissionToXoto,
    recipientPercentage: recipientInfo.recipientPercentage,
    commissionAmount: recipientInfo.commissionAmount,
    calculationFormula: recipientInfo.calculationFormula,
    referralType: recipientInfo.recipientRole === 'freelance_agent' ? 'Referral Only' : null,
    percentageSource: recipientInfo.percentageSource,
    disbursedAt: new Date(),
    status: 'Pending',
    payoutBankDetails: recipientInfo.payoutBankDetails || {},
    xotoEarnings: {
      amount: bankCommissionToXoto - recipientInfo.commissionAmount,
      rate: '1%',
      calculation: `${bankCommissionToXoto.toLocaleString()} - ${recipientInfo.commissionAmount.toLocaleString()} = ${(bankCommissionToXoto - recipientInfo.commissionAmount).toLocaleString()} AED`,
      note: `Paid ${recipientInfo.commissionAmount.toLocaleString()} AED to ${recipientInfo.recipientName}`
    },
    createdBy: adminId ? { role: 'admin', adminId } : { role: 'system' },
    notes: `Commission created from disbursed case. Xoto earned ${bankCommissionToXoto.toLocaleString()} AED (1% of loan). Paid ${recipientInfo.commissionAmount.toLocaleString()} AED to recipient.`
  });
  
  // Update case with commission info
  caseData.commissionInfo = {
    commissionId: commission.commissionId,
    loanAmount,
    loanTier: commission.loanTier,
    recipientPercentage: recipientInfo.recipientPercentage,
    xotoCommissionFromBank: bankCommissionToXoto,
    recipientCommissionAmount: recipientInfo.commissionAmount,
    calculation: recipientInfo.calculationFormula,
    status: 'Pending',
    bankCommissionRate: 0.01,
    createdAt: new Date()
  };
  await caseData.save();
  
  // Update recipient earnings
  if (recipientInfo.recipientRole === 'freelance_agent') {
    const agent = await VaultAgent.findById(recipientInfo.recipientId);
    if (agent && typeof agent.updateEarningsFromCommission === 'function') {
      await agent.updateEarningsFromCommission(recipientInfo.commissionAmount);
    }
  } else if (recipientInfo.recipientRole === 'partner') {
    const partner = await Partner.findById(recipientInfo.recipientId);
    if (partner && typeof partner.updateMetricsFromCommission === 'function') {
      await partner.updateMetricsFromCommission(recipientInfo.commissionAmount);
    }
  }
  
  return [commission];
};

// Commission summary for a recipient
commissionSchema.statics.getSummaryForRecipient = async function (recipientId, recipientRole, startDate, endDate) {
  const matchQuery = { 
    recipientId, 
    recipientRole, 
    isDeleted: false,
    isInternal: false 
  };

  if (startDate || endDate) {
    matchQuery.createdAt = {};
    if (startDate) matchQuery.createdAt.$gte = startDate;
    if (endDate) matchQuery.createdAt.$lte = endDate;
  }

  const summary = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$status',
        totalAmount: { $sum: '$commissionAmount' },
        count: { $sum: 1 },
      },
    },
  ]);

  const result = {
    totalEarned: 0,
    pending: 0,
    confirmed: 0,
    paid: 0,
    failed: 0,
    totalCount: 0,
  };

  summary.forEach(item => {
    const key = item._id.toLowerCase();
    if (result[key] !== undefined) result[key] = item.totalAmount;
    result.totalEarned += item.totalAmount;
    result.totalCount += item.count;
  });

  return result;
};

// Get Xoto internal earnings summary
commissionSchema.statics.getXotoEarningsSummary = async function (startDate, endDate) {
  const matchQuery = { 
    isInternal: true,
    isDeleted: false 
  };
  
  if (startDate || endDate) {
    matchQuery.createdAt = {};
    if (startDate) matchQuery.createdAt.$gte = startDate;
    if (endDate) matchQuery.createdAt.$lte = endDate;
  }
  
  const summary = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$leadSource',
        totalXotoEarnings: { $sum: '$xotoEarnings.amount' },
        totalLoanAmount: { $sum: '$loanAmount' },
        count: { $sum: 1 }
      }
    }
  ]);
  
  return summary;
};

// ══════════════════════════════════════════════════════════════════
// PRE-SAVE VALIDATION
// ══════════════════════════════════════════════════════════════════
commissionSchema.pre('save', function (next) {
  if (this.recipientRole !== 'internal') {
    if (this.commissionAmount <= 0 && this.status !== 'Completed') {
      return next(new Error('Commission amount must be greater than 0 for external commissions'));
    }
    if (this.recipientPercentage < 0 || this.recipientPercentage > 100) {
      return next(new Error('Commission percentage must be between 0 and 100'));
    }
  }
  next();
});

commissionSchema.set('toJSON', { virtuals: true });
commissionSchema.set('toObject', { virtuals: true });

const Commission = mongoose.models.Commission || mongoose.model('Commission', commissionSchema);
export default Commission;