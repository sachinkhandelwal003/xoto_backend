import mongoose from 'mongoose';
import crypto    from 'crypto';

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
//   Xoto earns 1% of disbursed amount from bank
//   Commission is created ONLY after Case → Disbursed
// ══════════════════════════════════════════════════════════════════

const commissionSchema = new mongoose.Schema(
  {
    // ── Unique ID ────────────────────────────────────────────────
    commissionId: { type: String, unique: true, required: true },

    // ── References ───────────────────────────────────────────────
    caseId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Case',      required: true },
    caseReference: { type: String, required: true },
    leadId:        { type: mongoose.Schema.Types.ObjectId, ref: 'VaultLead', default: null },
    proposalId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Proposal',  default: null },
    customerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Customer',  default: null },
    customerName:  { type: String, default: null },

    // ── Who receives this commission ─────────────────────────────
    // freelance_agent → FreelanceAgent (Referral Partner) earns directly
    // partner → Partner company earns (whether lead was from partner or affiliated agent)
    recipientRole: {
      type: String,
      enum: ['freelance_agent', 'partner'],
      required: true,
    },
    recipientId:    { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'recipientModel' },
    recipientModel: { type: String, enum: ['VaultAgent', 'Partner'], required: true },
    recipientName:  { type: String, required: true },

    // ── Source agent (if PartnerAffiliatedAgent submitted lead) ──
    // Commission still goes to partner — but we track which agent submitted
    sourceAgentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'VaultAgent', default: null },
    sourceAgentName: { type: String, default: null },

    // ── Loan details ─────────────────────────────────────────────
    loanAmount: { type: Number, required: true }, // actual disbursed amount
    loanTier:   { type: String, enum: ['≤5M AED', '>5M AED'], required: true },

    // ── Commission calculation ───────────────────────────────────
    // bankCommissionToXoto = loanAmount × 1%
    // commissionAmount     = bankCommissionToXoto × recipientPercentage / 100
    bankCommissionToXoto: { type: Number, required: true },
    recipientPercentage:  { type: Number, required: true },
    commissionAmount:     { type: Number, required: true },
    calculationFormula:   { type: String, required: true }, // audit trail e.g. "21000 × 40% = 8400"

    // ── PRD: only Referral Only — no referralPlusDocs ───────────
    referralType: {
      type:    String,
      enum:    ['Referral Only', null],
      default: null,
    },

    // ── Which config was used to get the percentage ──────────────
    percentageSource: {
      type: String,
      enum: [
        'freelance_commission.referralOnly', // FreelanceAgent — 40% or 50%
        'partner.commissionConfiguration',   // Partner — 80% or 85%
      ],
      default: null,
    },

    // ── Status ───────────────────────────────────────────────────
    // Pending    → auto-created after disbursement
    // Confirmed  → Admin confirms amount is correct
    // Processing → payment being processed
    // Paid       → payment sent + reference saved
    // Failed     → payment failed
    status: {
      type:    String,
      enum:    ['Pending', 'Confirmed', 'Processing', 'Paid', 'Failed'],
      default: 'Pending',
    },

    triggerStatus: { type: String, default: 'Disbursed' }, // what case status triggered this
    disbursedAt:   { type: Date, required: true },           // when loan was disbursed

    // ── Admin actions ────────────────────────────────────────────
    confirmedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    confirmedAt:        { type: Date, default: null },

    // ── Payment details ──────────────────────────────────────────
    paymentMethod:       { type: String, enum: ['Bank Transfer', 'Wallet', 'Cheque'], default: 'Bank Transfer' },
    paymentReference:    { type: String, default: null },
    paymentSentAt:       { type: Date,   default: null },
    paymentCompletedAt:  { type: Date,   default: null },
    paymentFailedReason: { type: String, default: null },

    // ── Payout bank snapshot ─────────────────────────────────────
    // Snapshot taken at commission creation time
    // So if agent updates bank details later, commission still goes to correct account
    payoutBankDetails: {
      beneficiaryName: { type: String, default: null },
      bankName:        { type: String, default: null },
      iban:            { type: String, default: null },
      swiftCode:       { type: String, default: null },
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
    deletedAt: { type: Date,    default: null },
  },
  { timestamps: true }
);

// ══════════════════════════════════════════════════════════════════
// INDEXES
// ══════════════════════════════════════════════════════════════════
commissionSchema.index({ commissionId: 1 },  { unique: true });
commissionSchema.index({ caseId: 1 });
commissionSchema.index({ caseReference: 1 });
commissionSchema.index({ customerId: 1 });
commissionSchema.index({ leadId: 1 });
commissionSchema.index({ recipientRole: 1, recipientId: 1 });
commissionSchema.index({ sourceAgentId: 1 });
commissionSchema.index({ status: 1 });
commissionSchema.index({ loanTier: 1 });
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

// ══════════════════════════════════════════════════════════════════
// INSTANCE METHODS
// ══════════════════════════════════════════════════════════════════

// Admin confirms commission is correct
commissionSchema.methods.confirm = function (adminId) {
  this.status             = 'Confirmed';
  this.confirmedByAdminId = adminId;
  this.confirmedAt        = new Date();
  return this.save();
};

// Admin marks commission as paid
commissionSchema.methods.markAsPaid = function (paymentReference, paymentMethod) {
  this.status             = 'Paid';
  this.paymentReference   = paymentReference;
  this.paymentMethod      = paymentMethod || this.paymentMethod;
  this.paymentSentAt      = new Date();
  this.paymentCompletedAt = new Date();
  return this.save();
};

// Mark payment as failed
commissionSchema.methods.markAsFailed = function (reason) {
  this.status              = 'Failed';
  this.paymentFailedReason = reason;
  return this.save();
};

// Update recipient earnings after commission confirmed/paid
commissionSchema.methods.updateRecipientEarnings = async function () {
  const VaultAgent = mongoose.model('VaultAgent');
  const Partner    = mongoose.model('Partner');

  if (this.recipientRole === 'freelance_agent') {
    const agent = await VaultAgent.findById(this.recipientId);
    if (agent) {
      await agent.updateEarningsFromCommission(
        this.commissionAmount,
        this.status === 'Confirmed'
      );
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

// Calculate commission amount and formula string
commissionSchema.statics.calculateCommission = function (bankCommissionToXoto, recipientPercentage) {
  const commissionAmount = Math.round((bankCommissionToXoto * recipientPercentage) / 100);
  const formula = `${bankCommissionToXoto.toLocaleString()} × ${recipientPercentage}% = ${commissionAmount.toLocaleString()}`;
  return { commissionAmount, formula };
};

// Get loan tier from loan amount
commissionSchema.statics.getLoanTier = function (loanAmount) {
  return loanAmount <= 5000000 ? '≤5M AED' : '>5M AED';
};

// ── Main static method ─────────────────────────────────────────
// Auto-create commission record from Case after it's marked Disbursed
// Called by Ops controller after case.markDisbursed()
//
// Handles 3 scenarios:
//   A. Case created by Partner directly → commission to Partner
//   B. Case created by Advisor (FreelanceAgent submitted lead) → commission to FreelanceAgent
//   C. Case created by Advisor (PartnerAffiliatedAgent submitted lead) → commission to Partner
commissionSchema.statics.createFromCase = async function (caseData, adminId = null) {
  const VaultAgent = mongoose.model('VaultAgent');
  const Partner    = mongoose.model('Partner');

  // Prevent duplicate commission for same case
  const existing = await this.findOne({ caseId: caseData._id, isDeleted: false });
  if (existing) {
    throw new Error(`Commission already exists for case ${caseData.caseReference}`);
  }

  // ✅ Use actual disbursed amount — not requested/approved
  const loanAmount = caseData.disbursementInfo?.disbursedAmount
    || caseData.amountTracking?.disbursedAmount
    || caseData.propertyInfo?.loanAmount
    || 0;

  if (!loanAmount || loanAmount <= 0) {
    throw new Error('Disbursed amount is required to create commission');
  }

  const loanTier             = this.getLoanTier(loanAmount);
  const bankCommissionToXoto = Math.round(loanAmount * 0.01); // Xoto earns 1% from bank

  // Customer name from case
  const customerName = caseData.clientInfo?.fullName || null;

  const commissionsCreated = [];

  // ── SCENARIO A: Partner created the case directly ─────────────
  if (caseData.createdBy?.role === 'partner') {
    const partner = await Partner.findById(caseData.createdBy.userId);
    if (!partner) throw new Error('Partner not found');

    if (typeof partner.getCommissionEligibilityStatus === 'function') {
      const eligibility = partner.getCommissionEligibilityStatus();
      if (!eligibility.eligible) throw new Error(`Partner not eligible: ${eligibility.reason}`);
    }

    const recipientPercentage = typeof partner.getCommissionPercentage === 'function'
      ? partner.getCommissionPercentage(loanAmount)
      : loanAmount <= 5000000 ? 80 : 85; // PRD defaults

    const { commissionAmount, formula } = this.calculateCommission(bankCommissionToXoto, recipientPercentage);

    const commission = await this.create({
      commissionId:         `COM-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      caseId:               caseData._id,
      caseReference:        caseData.caseReference,
      leadId:               caseData.sourceLeadId,
      proposalId:           caseData.proposalId || null,
      customerId:           caseData.customerId || null,
      customerName,
      recipientRole:        'partner',
      recipientId:          partner._id,
      recipientModel:       'Partner',
      recipientName:        partner.displayName || partner.companyName,
      loanAmount,
      loanTier,
      bankCommissionToXoto,
      recipientPercentage,
      commissionAmount,
      calculationFormula:   formula,
      percentageSource:     'partner.commissionConfiguration',
      disbursedAt:          caseData.disbursementInfo?.disbursementDate || new Date(),
      payoutBankDetails:    typeof partner.getPayoutBankDetails === 'function'
        ? partner.getPayoutBankDetails() : {},
      createdBy: adminId
        ? { role: 'admin', adminId }
        : { role: 'system' },
    });

    if (typeof partner.updateMetricsFromCommission === 'function') {
      await partner.updateMetricsFromCommission(commissionAmount);
    }

    commissionsCreated.push(commission);
  }

  // ── SCENARIO B & C: Advisor created the case ──────────────────
  // Need to find who submitted the original lead
  else if (caseData.createdBy?.role === 'advisor' || caseData.createdBy?.role === 'admin') {
    // Find the original lead to get who submitted it
    const Lead = mongoose.model('VaultLead');
    const lead = await Lead.findById(caseData.sourceLeadId);

    if (!lead) throw new Error('Source lead not found');

    const leadSourceId   = lead.sourceInfo?.createdById;
    const leadSourceModel = lead.sourceInfo?.createdByModel; // 'VaultAgent' or 'Partner'

    // ── SCENARIO B: FreelanceAgent submitted the lead ──────────
    if (leadSourceModel === 'VaultAgent') {
      const agent = await VaultAgent.findById(leadSourceId);
      if (!agent) throw new Error('Source agent not found');

      if (agent.agentType === 'FreelanceAgent') {
        // FreelanceAgent earns commission directly
        if (typeof agent.getCommissionEligibilityStatus === 'function') {
          const eligibility = agent.getCommissionEligibilityStatus();
          if (!eligibility.eligible) throw new Error(`Agent not eligible: ${eligibility.reason}`);
        }

        const recipientPercentage = typeof agent.getCommissionPercentage === 'function'
          ? agent.getCommissionPercentage(loanAmount)
          : loanAmount <= 5000000 ? 40 : 50; // PRD defaults

        const { commissionAmount, formula } = this.calculateCommission(bankCommissionToXoto, recipientPercentage);

        const commission = await this.create({
          commissionId:        `COM-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
          caseId:              caseData._id,
          caseReference:       caseData.caseReference,
          leadId:              caseData.sourceLeadId,
          proposalId:          caseData.proposalId || null,
          customerId:          caseData.customerId || null,
          customerName,
          recipientRole:       'freelance_agent',
          recipientId:         agent._id,
          recipientModel:      'VaultAgent',
          recipientName:       agent.fullName,
          sourceAgentId:       agent._id,
          sourceAgentName:     agent.fullName,
          loanAmount,
          loanTier,
          bankCommissionToXoto,
          recipientPercentage,
          commissionAmount,
          calculationFormula:  formula,
          referralType:        'Referral Only',
          percentageSource:    'freelance_commission.referralOnly',
          disbursedAt:         caseData.disbursementInfo?.disbursementDate || new Date(),
          payoutBankDetails:   typeof agent.getPayoutBankDetails === 'function'
            ? agent.getPayoutBankDetails() : {},
          createdBy: adminId
            ? { role: 'admin', adminId }
            : { role: 'system' },
        });

        if (typeof agent.updateEarningsFromCommission === 'function') {
          await agent.updateEarningsFromCommission(commissionAmount);
        }

        commissionsCreated.push(commission);

      } else if (agent.agentType === 'PartnerAffiliatedAgent') {
        // ── SCENARIO C: Affiliated agent → commission goes to Partner ──
        const partner = await Partner.findById(agent.partnerId);
        if (!partner) throw new Error('Partner not found for affiliated agent');

        if (typeof partner.getCommissionEligibilityStatus === 'function') {
          const eligibility = partner.getCommissionEligibilityStatus();
          if (!eligibility.eligible) throw new Error(`Partner not eligible: ${eligibility.reason}`);
        }

        const recipientPercentage = typeof partner.getCommissionPercentage === 'function'
          ? partner.getCommissionPercentage(loanAmount)
          : loanAmount <= 5000000 ? 80 : 85; // PRD defaults

        const { commissionAmount, formula } = this.calculateCommission(bankCommissionToXoto, recipientPercentage);

        const commission = await this.create({
          commissionId:        `COM-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
          caseId:              caseData._id,
          caseReference:       caseData.caseReference,
          leadId:              caseData.sourceLeadId,
          proposalId:          caseData.proposalId || null,
          customerId:          caseData.customerId || null,
          customerName,
          recipientRole:       'partner',
          recipientId:         partner._id,
          recipientModel:      'Partner',
          recipientName:       partner.displayName || partner.companyName,
          sourceAgentId:       agent._id,   // track which agent submitted the lead
          sourceAgentName:     agent.fullName,
          loanAmount,
          loanTier,
          bankCommissionToXoto,
          recipientPercentage,
          commissionAmount,
          calculationFormula:  formula,
          percentageSource:    'partner.commissionConfiguration',
          disbursedAt:         caseData.disbursementInfo?.disbursementDate || new Date(),
          payoutBankDetails:   typeof partner.getPayoutBankDetails === 'function'
            ? partner.getPayoutBankDetails() : {},
          createdBy: adminId
            ? { role: 'admin', adminId }
            : { role: 'system' },
        });

        if (typeof partner.updateMetricsFromCommission === 'function') {
          await partner.updateMetricsFromCommission(commissionAmount);
        }

        commissionsCreated.push(commission);
      }
    }

    // ── Lead from Partner directly (individual partner) ────────
    else if (leadSourceModel === 'Partner') {
      const partner = await Partner.findById(leadSourceId);
      if (!partner) throw new Error('Partner not found');

      const recipientPercentage = typeof partner.getCommissionPercentage === 'function'
        ? partner.getCommissionPercentage(loanAmount)
        : loanAmount <= 5000000 ? 80 : 85;

      const { commissionAmount, formula } = this.calculateCommission(bankCommissionToXoto, recipientPercentage);

      const commission = await this.create({
        commissionId:        `COM-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        caseId:              caseData._id,
        caseReference:       caseData.caseReference,
        leadId:              caseData.sourceLeadId,
        proposalId:          caseData.proposalId || null,
        customerId:          caseData.customerId || null,
        customerName,
        recipientRole:       'partner',
        recipientId:         partner._id,
        recipientModel:      'Partner',
        recipientName:       partner.displayName || partner.companyName,
        loanAmount,
        loanTier,
        bankCommissionToXoto,
        recipientPercentage,
        commissionAmount,
        calculationFormula:  formula,
        percentageSource:    'partner.commissionConfiguration',
        disbursedAt:         caseData.disbursementInfo?.disbursementDate || new Date(),
        payoutBankDetails:   typeof partner.getPayoutBankDetails === 'function'
          ? partner.getPayoutBankDetails() : {},
        createdBy: adminId
          ? { role: 'admin', adminId }
          : { role: 'system' },
      });

      if (typeof partner.updateMetricsFromCommission === 'function') {
        await partner.updateMetricsFromCommission(commissionAmount);
      }

      commissionsCreated.push(commission);
    }
  }

  return commissionsCreated;
};

// Commission summary for a recipient — used in dashboard
commissionSchema.statics.getSummaryForRecipient = async function (recipientId, recipientRole, startDate, endDate) {
  const matchQuery = { recipientId, recipientRole, isDeleted: false };

  if (startDate || endDate) {
    matchQuery.createdAt = {};
    if (startDate) matchQuery.createdAt.$gte = startDate;
    if (endDate)   matchQuery.createdAt.$lte = endDate;
  }

  const summary = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id:         '$status',
        totalAmount: { $sum: '$commissionAmount' },
        count:       { $sum: 1 },
      },
    },
  ]);

  const result = {
    totalEarned: 0,
    pending:     0,
    confirmed:   0,
    paid:        0,
    failed:      0,
    totalCount:  0,
  };

  summary.forEach(item => {
    const key = item._id.toLowerCase();
    if (result[key] !== undefined) result[key] = item.totalAmount;
    result.totalEarned += item.totalAmount;
    result.totalCount  += item.count;
  });

  return result;
};

// ══════════════════════════════════════════════════════════════════
// PRE-SAVE VALIDATION
// ══════════════════════════════════════════════════════════════════
commissionSchema.pre('save', function (next) {
  if (this.commissionAmount <= 0)
    return next(new Error('Commission amount must be greater than 0'));
  if (this.recipientPercentage < 0 || this.recipientPercentage > 100)
    return next(new Error('Commission percentage must be between 0 and 100'));
  next();
});

commissionSchema.set('toJSON',   { virtuals: true });
commissionSchema.set('toObject', { virtuals: true });

const Commission = mongoose.models.Commission || mongoose.model('Commission', commissionSchema);
export default Commission;