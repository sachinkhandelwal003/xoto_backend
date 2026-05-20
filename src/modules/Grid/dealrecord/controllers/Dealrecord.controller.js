
'use strict';

const DealRecord      = require('../models/Dealrecord.model');
const PartnerAgreement = require('../models/Partneragreement.model');
const GridLead        = require('../../Lead/model/gridLead.model');
const GridAdvisor     = require('../../../Grid/Advisor/model/index');
const Agent           = require('../../Agent/models/agent');
const Agency          = require('../../../Grid/agency/models/index');
const Customer        = require('../../../auth/models/user/customer.model');
const Property        = require('../../../properties/models/property.model');
const Inventory       = require('../../../properties/models/property.inventory.model');
const asyncHandler    = require('../../../../utils/asyncHandler');
const { APIError }    = require('../../../../utils/errorHandler');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');

// ─── Commission calculator ────────────────────────────────────────────────────
const calcCommission = (transactionValue, grossPercent, partnerPercent, referralPercent) => {
  const gross         = (transactionValue * grossPercent)   / 100;
  const partnerShare  = (gross * partnerPercent)  / 100;
  const referralShare = (gross * referralPercent) / 100;
  const xotoRetained  = gross - partnerShare - referralShare;

  return {
    grossAmount:     Math.round(gross),
    grossPercent,
    xotoRetained:    Math.round(xotoRetained),
    xotoPercent:     Number((xotoRetained / transactionValue * 100).toFixed(2)),
    partnerShare:    Math.round(partnerShare),
    partnerPercent,
    referralShare:   Math.round(referralShare),
    referralPercent,
  };
};

const validatePercent = (value, fieldName) => {
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new APIError(`${fieldName} must be a number between 0 and 100`, StatusCodes.BAD_REQUEST);
  }
  return percent;
};

const getAgreementTerms = async (partnerAgreementId, { agencyId, agentId, referralPartnerId }) => {
  if (!partnerAgreementId) return null;

  const agreement = await PartnerAgreement.findById(partnerAgreementId);
  if (!agreement) throw new APIError('Partner Agreement not found', StatusCodes.NOT_FOUND);
  if (agreement.status !== 'active') {
    throw new APIError(`Partner Agreement is ${agreement.status}; only active agreements can be linked`, StatusCodes.BAD_REQUEST);
  }

  const linkedToAgency = agencyId && agreement.agencyId?.toString() === agencyId.toString();
  const linkedToAgent = agentId && agreement.agentId?.toString() === agentId.toString();
  const linkedToReferral = referralPartnerId && agreement.referralPartnerId?.toString() === referralPartnerId.toString();

  if (!linkedToAgency && !linkedToAgent && !linkedToReferral) {
    throw new APIError('Partner Agreement does not belong to the linked agency, agent, or referral partner', StatusCodes.BAD_REQUEST);
  }

  return {
    partnerPercent: validatePercent(agreement.commissionSplitPercent, 'commissionSplitPercent'),
    referralPercent: validatePercent(agreement.referralSplitPercent || 0, 'referralSplitPercent'),
  };
};

// ─── Role helpers ─────────────────────────────────────────────────────────────
const isAdmin = (role) => {
  if (!role) return false;
  if (typeof role === 'object') {
    return role?.isSuperAdmin === true ||
           Number(role?.code) === 0    ||
           Number(role?.code) === 1;
  }
  return role === 'xoto_super_admin' || role === 'xoto_staff_admin';
};

const isSuperAdmin = (role) => {
  if (!role) return false;
  if (typeof role === 'object') return role?.isSuperAdmin === true || Number(role?.code) === 0;
  return role === 'xoto_super_admin';
};

const isAdvisor = (role) => {
  if (!role) return false;
  if (typeof role === 'object') return Number(role?.code) === 16;
  return role === 'GridAdvisor';
};

const isAgent = (role) => {
  if (!role) return false;
  if (typeof role === 'object') return Number(role?.code) === 18;
  return role === 'agent';
};

const isAgency = (role) => {
  if (!role) return false;
  if (typeof role === 'object') return Number(role?.code) === 15;
  return role === 'agency';
};

const isReferralPartner = (role) => {
  if (!role) return false;
  if (typeof role === 'object') return Number(role?.code) === 19;
  return role === 'GridReferralPartner';
};

// ─── Pagination helper ────────────────────────────────────────────────────────
const paginate = (query) => {
  const page  = Math.max(1, parseInt(query.page)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
};

const paginationMeta = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages:  Math.ceil(total / limit),
  hasNextPage: page < Math.ceil(total / limit),
  hasPrevPage: page > 1,
});

// ─── Status log helper ────────────────────────────────────────────────────────
const pushStatusLog = (deal, from, to, userId, note = '') => {
  deal.statusHistory.push({ from, to, changedBy: userId, note, at: new Date() });
};

// ════════════════════════════════════════════════════════════════════════════
// CREATE DEAL RECORD — Admin only (PRD §8.5, §12.5)
// POST /deal-records
// ════════════════════════════════════════════════════════════════════════════
exports.createDealRecord = asyncHandler(async (req, res) => {
  const adminId = req.user._id;
  const {
    leadId, propertyId, inventoryUnitId,
    customerId, advisorId, agentId, agencyId,
    referralPartnerId, partnerAgreementId,
    dealType, transactionValue,
    grossPercent    = 2,
    partnerPercent  = 0,
    referralPercent = 0,
    notes,
  } = req.body;

  if (!leadId || !propertyId || !customerId || !dealType || !transactionValue) {
    throw new APIError(
      'leadId, propertyId, customerId, dealType, and transactionValue are required',
      StatusCodes.BAD_REQUEST
    );
  }

  // ── Duplicate guard ────────────────────────────────────────────────────────
  const existing = await DealRecord.findOne({ leadId, isVoided: false });
  if (existing) {
    throw new APIError(
      `A deal record already exists for this lead (${existing.dealReference})`,
      StatusCodes.CONFLICT
    );
  }

  // ── Verify core entities ───────────────────────────────────────────────────
  const [lead, property, customer] = await Promise.all([
    GridLead.findById(leadId),
    Property.findById(propertyId),
    Customer.findById(customerId),
  ]);
  if (!lead)     throw new APIError('Lead not found',     StatusCodes.NOT_FOUND);
  if (!property) throw new APIError('Property not found', StatusCodes.NOT_FOUND);
  if (!customer) throw new APIError('Customer not found', StatusCodes.NOT_FOUND);

  // ── Verify optional refs ───────────────────────────────────────────────────
  if (advisorId) {
    const advisor = await GridAdvisor.findById(advisorId);
    if (!advisor) throw new APIError('Advisor not found', StatusCodes.NOT_FOUND);
  }
  if (agentId) {
    const agent = await Agent.findById(agentId);
    if (!agent) throw new APIError('Agent not found', StatusCodes.NOT_FOUND);
  }
  if (agencyId) {
    const agency = await Agency.findById(agencyId);
    if (!agency) throw new APIError('Agency not found', StatusCodes.NOT_FOUND);
  }
  if (inventoryUnitId) {
    const unit = await Inventory.findById(inventoryUnitId);
    if (!unit) throw new APIError('Inventory unit not found', StatusCodes.NOT_FOUND);
    if (!['available', 'reserved', 'booked', 'spa_signed'].includes(unit.status)) {
      throw new APIError(
        `Inventory unit cannot be linked — current status: ${unit.status}`,
        StatusCodes.BAD_REQUEST
      );
    }
  }

  const agreementTerms = await getAgreementTerms(partnerAgreementId, {
    agencyId,
    agentId,
    referralPartnerId,
  });
  const finalGrossPercent = validatePercent(grossPercent, 'grossPercent');
  const finalPartnerPercent = agreementTerms
    ? agreementTerms.partnerPercent
    : validatePercent(partnerPercent, 'partnerPercent');
  const finalReferralPercent = agreementTerms
    ? agreementTerms.referralPercent
    : validatePercent(referralPercent, 'referralPercent');

  if (finalPartnerPercent + finalReferralPercent > 100) {
    throw new APIError('partnerPercent and referralPercent cannot exceed 100 combined', StatusCodes.BAD_REQUEST);
  }

  // ── Determine referral commission status ──────────────────────────────────
  const referralCommissionStatus = referralPartnerId ? 'pending' : 'not_applicable';

  const commission = calcCommission(transactionValue, finalGrossPercent, finalPartnerPercent, finalReferralPercent);

  const deal = new DealRecord({
    leadId,
    propertyId,
    inventoryUnitId: inventoryUnitId || null,
    customerId,
    advisorId:          advisorId          || null,
    agentId:            agentId            || null,
    agencyId:           agencyId           || null,
    referralPartnerId:  referralPartnerId  || null,
    partnerAgreementId: partnerAgreementId || null,
    dealType,
    transactionValue,
    commission,
    commissionStatus: 'pending',
    referralCommissionStatus,
    notes: notes || '',
    createdBy: adminId,
  });

  pushStatusLog(deal, null, 'pending', adminId, 'Deal record created');
  await deal.save();

  // ── Update Lead ────────────────────────────────────────────────────────────
  await GridLead.findByIdAndUpdate(leadId, {
    status: 'completed',
    'deal_record.created':            true,
    'deal_record.deal_record_id':     deal._id,
    'deal_record.inventory_unit_id':  inventoryUnitId || null,
    'deal_record.transaction_value':  transactionValue,
    'deal_record.commission_amount':  commission.grossAmount,
    'deal_record.closed_at':          new Date(),
  });

  // ── Update Inventory unit ──────────────────────────────────────────────────
  if (inventoryUnitId) {
    await Inventory.findByIdAndUpdate(inventoryUnitId, {
      status:       dealType === 'sale' ? 'spa_signed' : 'booked',
      soldAt:       new Date(),
      soldBy:       advisorId || agentId || adminId,
      dealRecordId: deal._id,
      leadId:       leadId,
    });
  }

  // ── Update Advisor workload ───────────────────────────────────────────────
  if (advisorId) {
    await GridAdvisor.findByIdAndUpdate(advisorId, {
      $inc: {
        'workload.totalDealsCompleted': 1,
        'workload.activeLeadsCount':   -1,
      },
    });
  }

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Deal record created successfully',
    data:    deal,
  });
});

// ════════════════════════════════════════════════════════════════════════════
// UPDATE DEAL RECORD — Admin only, before confirmation (PRD §12.3)
// PATCH /deal-records/:id
// ════════════════════════════════════════════════════════════════════════════
exports.updateDealRecord = asyncHandler(async (req, res) => {
  const adminId = req.user._id;

  const deal = await DealRecord.findById(req.params.id);
  if (!deal) throw new APIError('Deal record not found', StatusCodes.NOT_FOUND);

  if (deal.isLocked) {
    throw new APIError(
      'Deal record is locked after confirmation — cannot be edited',
      StatusCodes.FORBIDDEN
    );
  }
  if (deal.isVoided) {
    throw new APIError('Deal record has been voided', StatusCodes.FORBIDDEN);
  }

  const allowedFields = [
    'transactionValue', 'grossPercent', 'partnerPercent', 'referralPercent',
    'dealType', 'advisorId', 'agentId', 'agencyId', 'referralPartnerId',
    'partnerAgreementId', 'inventoryUnitId', 'notes',
  ];

  const snapshot = {};
  const updates  = {};

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      snapshot[field] = deal[field];
      updates[field]  = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new APIError('No valid fields to update', StatusCodes.BAD_REQUEST);
  }

  Object.assign(deal, updates);

  // Recalculate commission if financials changed
  if (
    updates.transactionValue !== undefined ||
    updates.grossPercent     !== undefined ||
    updates.partnerPercent   !== undefined ||
    updates.referralPercent  !== undefined ||
    updates.partnerAgreementId !== undefined
  ) {
    const agreementTerms = await getAgreementTerms(
      updates.partnerAgreementId ?? deal.partnerAgreementId,
      {
        agencyId: updates.agencyId ?? deal.agencyId,
        agentId: updates.agentId ?? deal.agentId,
        referralPartnerId: updates.referralPartnerId ?? deal.referralPartnerId,
      }
    );
    const finalGrossPercent = validatePercent(
      req.body.grossPercent ?? deal.commission.grossPercent,
      'grossPercent'
    );
    const finalPartnerPercent = agreementTerms
      ? agreementTerms.partnerPercent
      : validatePercent(req.body.partnerPercent ?? deal.commission.partnerPercent, 'partnerPercent');
    const finalReferralPercent = agreementTerms
      ? agreementTerms.referralPercent
      : validatePercent(req.body.referralPercent ?? deal.commission.referralPercent, 'referralPercent');

    if (finalPartnerPercent + finalReferralPercent > 100) {
      throw new APIError('partnerPercent and referralPercent cannot exceed 100 combined', StatusCodes.BAD_REQUEST);
    }

    deal.commission = calcCommission(
      deal.transactionValue,
      finalGrossPercent,
      finalPartnerPercent,
      finalReferralPercent
    );
  }

  deal.editHistory.push({
    editedBy:  adminId,
    editedAt:  new Date(),
    fields:    snapshot,
    reason:    req.body.editReason || '',
  });

  await deal.save();

  res.json({ success: true, message: 'Deal record updated', data: deal });
});

// ════════════════════════════════════════════════════════════════════════════
// UPLOAD EVIDENCE — Admin only (PRD §8.5)
// PATCH /deal-records/:id/evidence
// ════════════════════════════════════════════════════════════════════════════
exports.uploadEvidence = asyncHandler(async (req, res) => {
  const { evidenceDocuments } = req.body;

  if (!Array.isArray(evidenceDocuments) || evidenceDocuments.length === 0) {
    throw new APIError('evidenceDocuments array is required', StatusCodes.BAD_REQUEST);
  }

  const deal = await DealRecord.findById(req.params.id);
  if (!deal) throw new APIError('Deal record not found', StatusCodes.NOT_FOUND);

  if (deal.isLocked) {
    throw new APIError(
      'Deal record is locked — evidence cannot be modified after confirmation',
      StatusCodes.FORBIDDEN
    );
  }
  if (deal.isVoided) {
    throw new APIError('Deal record has been voided', StatusCodes.FORBIDDEN);
  }

  const docs = evidenceDocuments.map(d => ({
    docType:    d.docType,
    url:        d.url,
    uploadedAt: new Date(),
    uploadedBy: req.user._id,
  }));

  deal.evidenceDocuments.push(...docs);
  deal.evidenceUploaded = true;

  await deal.save();

  res.json({
    success: true,
    message: 'Evidence uploaded successfully',
    data:    { evidenceDocuments: deal.evidenceDocuments, evidenceUploaded: deal.evidenceUploaded },
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CONFIRM DEAL — Admin only (PRD §8.5, §12.5)
// PATCH /deal-records/:id/confirm
// ════════════════════════════════════════════════════════════════════════════
exports.confirmDeal = asyncHandler(async (req, res) => {
  const adminId = req.user._id;

  const deal = await DealRecord.findById(req.params.id);
  if (!deal) throw new APIError('Deal record not found', StatusCodes.NOT_FOUND);

  if (deal.isVoided) {
    throw new APIError('Cannot confirm a voided deal record', StatusCodes.BAD_REQUEST);
  }
  if (deal.commissionStatus !== 'pending') {
    throw new APIError(
      `Deal is already ${deal.commissionStatus} — cannot re-confirm`,
      StatusCodes.BAD_REQUEST
    );
  }
  if (!deal.evidenceUploaded || deal.evidenceDocuments.length === 0) {
    throw new APIError(
      'At least one evidence document (SPA or booking form) is required before confirming',
      StatusCodes.BAD_REQUEST
    );
  }

  const previousStatus      = deal.commissionStatus;
  deal.commissionStatus     = 'confirmed';
  deal.confirmedAt          = new Date();
  deal.confirmedBy          = adminId;
  deal.isLocked             = true;

  // Referral commission becomes confirmed alongside main commission
  if (deal.referralCommissionStatus === 'pending') {
    deal.referralCommissionStatus = 'confirmed';
  }

  pushStatusLog(deal, previousStatus, 'confirmed', adminId, req.body.note || '');
  await deal.save();

  // Mark inventory as sold
  if (deal.inventoryUnitId) {
    await Inventory.findByIdAndUpdate(deal.inventoryUnitId, { status: 'sold' });
  }

  res.json({
    success: true,
    message: 'Deal confirmed — record is now immutable',
    data: {
      dealReference:    deal.dealReference,
      commissionStatus: deal.commissionStatus,
      confirmedAt:      deal.confirmedAt,
      commission:       deal.commission,
    },
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MARK COMMISSION AS PAID — Admin only (PRD §12.5)
// PATCH /deal-records/:id/pay
// ════════════════════════════════════════════════════════════════════════════
exports.markAsPaid = asyncHandler(async (req, res) => {
  const adminId = req.user._id;

  const deal = await DealRecord.findById(req.params.id);
  if (!deal) throw new APIError('Deal record not found', StatusCodes.NOT_FOUND);

  if (deal.commissionStatus !== 'confirmed') {
    throw new APIError('Deal must be confirmed before marking as paid', StatusCodes.BAD_REQUEST);
  }

  const previousStatus  = deal.commissionStatus;
  deal.commissionStatus = 'paid';
  deal.paidAt           = new Date();
  deal.paidBy           = adminId;

  pushStatusLog(deal, previousStatus, 'paid', adminId, req.body.note || '');
  await deal.save();

  // ── Sync referral partner commission status in GridLead ───────────────────
  if (deal.referralPartnerId && deal.commission.referralShare > 0) {
    try {
      await GridLead.findByIdAndUpdate(deal.leadId, {
        'referral_info.commission_status':  'paid',
        'referral_info.commission_paid_at': new Date(),
      });
    } catch (err) {
      // Non-blocking: log and continue — deal is already paid
      console.warn('[DealRecord] Failed to sync referral commission on lead:', err.message);
    }
  }

  res.json({
    success: true,
    message: 'Commission marked as paid',
    data: {
      dealReference:    deal.dealReference,
      commissionStatus: deal.commissionStatus,
      paidAt:           deal.paidAt,
      partnerShare:     deal.commission.partnerShare,
      referralShare:    deal.commission.referralShare,
      xotoRetained:     deal.commission.xotoRetained,
    },
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MARK REFERRAL COMMISSION AS PAID — Admin only (PRD §12.5)
// Separate from main commission — PRD §3.2: 25-30% referral payout
// PATCH /deal-records/:id/pay-referral
// ════════════════════════════════════════════════════════════════════════════
exports.markReferralAsPaid = asyncHandler(async (req, res) => {
  const adminId = req.user._id;

  const deal = await DealRecord.findById(req.params.id);
  if (!deal) throw new APIError('Deal record not found', StatusCodes.NOT_FOUND);

  if (!deal.referralPartnerId) {
    throw new APIError('No referral partner linked to this deal', StatusCodes.BAD_REQUEST);
  }
  if (deal.referralCommissionStatus !== 'confirmed') {
    throw new APIError(
      `Referral commission must be confirmed before marking as paid. Current: ${deal.referralCommissionStatus}`,
      StatusCodes.BAD_REQUEST
    );
  }

  deal.referralCommissionStatus = 'paid';
  deal.referralPaidAt           = new Date();
  deal.referralPaidBy           = adminId;

  pushStatusLog(deal, 'referral_confirmed', 'referral_paid', adminId, req.body.note || '');
  await deal.save();

  // Sync to lead
  try {
    await GridLead.findByIdAndUpdate(deal.leadId, {
      'referral_info.commission_status':  'paid',
      'referral_info.commission_paid_at': new Date(),
    });
  } catch (err) {
    console.warn('[DealRecord] Referral sync failed:', err.message);
  }

  res.json({
    success: true,
    message: 'Referral commission marked as paid',
    data: {
      dealReference:            deal.dealReference,
      referralCommissionStatus: deal.referralCommissionStatus,
      referralPaidAt:           deal.referralPaidAt,
      referralShare:            deal.commission.referralShare,
    },
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FLAG DEAL — Admin only (PRD §12.3)
// PATCH /deal-records/:id/flag
// ════════════════════════════════════════════════════════════════════════════
exports.flagDeal = asyncHandler(async (req, res) => {
  const adminId = req.user._id;
  const { reason } = req.body;

  if (!reason) throw new APIError('Flag reason is required', StatusCodes.BAD_REQUEST);

  const deal = await DealRecord.findById(req.params.id);
  if (!deal) throw new APIError('Deal record not found', StatusCodes.NOT_FOUND);
  if (deal.isVoided) throw new APIError('Cannot flag a voided deal', StatusCodes.BAD_REQUEST);

  deal.isFlagged  = true;
  deal.flagReason = reason;
  deal.flaggedBy  = adminId;
  deal.flaggedAt  = new Date();

  pushStatusLog(deal, 'flagged', 'flagged', adminId, reason);
  await deal.save();

  res.json({ success: true, message: 'Deal flagged for review', data: deal });
});

// ════════════════════════════════════════════════════════════════════════════
// UNFLAG DEAL — Admin only
// PATCH /deal-records/:id/unflag
// ════════════════════════════════════════════════════════════════════════════
exports.unflagDeal = asyncHandler(async (req, res) => {
  const deal = await DealRecord.findById(req.params.id);
  if (!deal) throw new APIError('Deal record not found', StatusCodes.NOT_FOUND);

  deal.isFlagged  = false;
  deal.flagReason = '';
  deal.flaggedBy  = null;
  deal.flaggedAt  = null;

  pushStatusLog(deal, 'flagged', 'unflagged', req.user._id, req.body.note || '');
  await deal.save();

  res.json({ success: true, message: 'Deal flag removed', data: deal });
});

// ════════════════════════════════════════════════════════════════════════════
// VOID DEAL — Super Admin only (PRD §12.3)
// Soft delete — preserves commission ledger integrity per PRD §14.4
// PATCH /deal-records/:id/void
// ════════════════════════════════════════════════════════════════════════════
exports.voidDeal = asyncHandler(async (req, res) => {
  if (!isSuperAdmin(req.user.role)) {
    throw new APIError('Only super admin can void a deal record', StatusCodes.FORBIDDEN);
  }

  const { reason } = req.body;
  if (!reason) throw new APIError('Void reason is required', StatusCodes.BAD_REQUEST);

  const deal = await DealRecord.findById(req.params.id);
  if (!deal) throw new APIError('Deal record not found', StatusCodes.NOT_FOUND);
  if (deal.isVoided) throw new APIError('Deal already voided', StatusCodes.BAD_REQUEST);

  deal.isVoided   = true;
  deal.voidReason = reason;
  deal.voidedBy   = req.user._id;
  deal.voidedAt   = new Date();

  // Release inventory if linked and not sold
  if (deal.inventoryUnitId) {
    const unit = await Inventory.findById(deal.inventoryUnitId);
    if (unit && unit.status !== 'sold') {
      await Inventory.findByIdAndUpdate(deal.inventoryUnitId, {
        status:       'available',
        reservedBy:   null,
        reservedAt:   null,
        bookedBy:     null,
        bookedAt:     null,
        soldBy:       null,
        soldAt:       null,
        dealRecordId: null,
        leadId:       null,
      });
    }
  }

  // Revert lead status
  await GridLead.findByIdAndUpdate(deal.leadId, {
    status:                          'in_discussion',
    'deal_record.created':           false,
    'deal_record.deal_record_id':    null,
    'deal_record.inventory_unit_id': null,
  });

  pushStatusLog(deal, deal.commissionStatus, 'voided', req.user._id, reason);
  await deal.save();

  res.json({ success: true, message: 'Deal record voided', data: { dealReference: deal.dealReference, voidedAt: deal.voidedAt } });
});

// ════════════════════════════════════════════════════════════════════════════
// ESCALATE DEAL — Admin only (PRD §12.3)
// PATCH /deal-records/:id/escalate
// ════════════════════════════════════════════════════════════════════════════
exports.escalateDeal = asyncHandler(async (req, res) => {
  const adminId = req.user._id;
  const { note } = req.body;

  if (!note) throw new APIError('Escalation note is required', StatusCodes.BAD_REQUEST);

  const deal = await DealRecord.findById(req.params.id);
  if (!deal) throw new APIError('Deal record not found', StatusCodes.NOT_FOUND);
  if (deal.isVoided) throw new APIError('Cannot escalate a voided deal', StatusCodes.BAD_REQUEST);

  deal.isEscalated    = true;
  deal.escalationNote = note;
  deal.escalatedBy    = adminId;
  deal.escalatedAt    = new Date();

  pushStatusLog(deal, null, 'escalated', adminId, note);
  await deal.save();

  res.json({ success: true, message: 'Deal escalated to super admin', data: deal });
});

// ════════════════════════════════════════════════════════════════════════════
// GET ALL DEAL RECORDS — Admin full ledger (PRD §12.5)
// GET /deal-records
// ════════════════════════════════════════════════════════════════════════════
exports.getAllDealRecords = asyncHandler(async (req, res) => {
  const {
    commissionStatus, agentId, agencyId, advisorId,
    dealType, fromDate, toDate,
    isFlagged, isVoided, isEscalated,
    referralPartnerId, propertyId,
    sortOrder = 'desc',
  } = req.query;

  const { page, limit, skip } = paginate(req.query);

  const filter = {};
  if (commissionStatus)  filter.commissionStatus  = commissionStatus;
  if (agentId)           filter.agentId           = agentId;
  if (agencyId)          filter.agencyId          = agencyId;
  if (advisorId)         filter.advisorId         = advisorId;
  if (dealType)          filter.dealType          = dealType;
  if (referralPartnerId) filter.referralPartnerId = referralPartnerId;
  if (propertyId)        filter.propertyId        = propertyId;
  if (isFlagged   !== undefined) filter.isFlagged    = isFlagged   === 'true';
  if (isVoided    !== undefined) filter.isVoided     = isVoided    === 'true';
  if (isEscalated !== undefined) filter.isEscalated  = isEscalated === 'true';

  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate)   filter.createdAt.$lte = new Date(toDate);
  }

  const sortDir = sortOrder === 'asc' ? 1 : -1;

  const [deals, total] = await Promise.all([
    DealRecord.find(filter)
      .populate('leadId',       'contact_info classification lead_type source')
      .populate('propertyId',   'propertyName area city propertySubType price mainLogo')
      .populate('customerId',   'firstName lastName phone email')
      .populate('advisorId',    'firstName lastName email phone employeeId')
      .populate('agentId',      'first_name last_name email phone_number')
      .populate('agencyId',     'companyName primaryContactEmail')
      .populate('referralPartnerId', 'firstName lastName phone')
      .populate('inventoryUnitId',   'unitNumber floorNumber unitType bedroomType price status')
      .populate('createdBy',    'firstName lastName email')
      .populate('partnerAgreementId', 'commissionSplitPercent effectiveDate status')
      .sort({ createdAt: sortDir })
      .skip(skip)
      .limit(limit),
    DealRecord.countDocuments(filter),
  ]);

  // Commission summary across the filtered set
  const summary = await DealRecord.aggregate([
    { $match: filter },
    {
      $group: {
        _id:           '$commissionStatus',
        count:         { $sum: 1 },
        totalGross:    { $sum: '$commission.grossAmount' },
        totalXoto:     { $sum: '$commission.xotoRetained' },
        totalPartner:  { $sum: '$commission.partnerShare' },
        totalReferral: { $sum: '$commission.referralShare' },
      },
    },
  ]);

  res.json({
    success: true,
    data:    deals,
    pagination: paginationMeta(total, page, limit),
    summary,
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET SINGLE DEAL RECORD — Admin + owning Advisor (PRD §10.4, ownership check)
// GET /deal-records/:id
// ════════════════════════════════════════════════════════════════════════════
exports.getDealRecordById = asyncHandler(async (req, res) => {
  const { role, _id: userId } = req.user;

  const deal = await DealRecord.findById(req.params.id)
    .populate('leadId')
    .populate('propertyId',   'propertyName area city propertySubType price mainLogo completionDate')
    .populate('customerId',   'firstName lastName phone email')
    .populate('advisorId',    'firstName lastName email phone employeeId department')
    .populate('agentId',      'first_name last_name email phone_number operating_city')
    .populate('agencyId',     'companyName primaryContactName primaryContactEmail')
    .populate('referralPartnerId', 'firstName lastName phone email')
    .populate('inventoryUnitId')
    .populate('partnerAgreementId')
    .populate('createdBy',    'firstName lastName email')
    .populate('confirmedBy',  'firstName lastName email')
    .populate('paidBy',       'firstName lastName email');

  if (!deal) throw new APIError('Deal record not found', StatusCodes.NOT_FOUND);

  // ── Ownership check (PRD §10.4) ───────────────────────────────────────────
  if (isAdvisor(role)) {
    const ownsDeal = deal.advisorId && deal.advisorId._id?.toString() === userId.toString();
    if (!ownsDeal) throw new APIError('You can only view your own deal records', StatusCodes.FORBIDDEN);
  }

  if (isAgent(role)) {
    const ownsDeal = deal.agentId && deal.agentId._id?.toString() === userId.toString();
    if (!ownsDeal) throw new APIError('You can only view your own deal records', StatusCodes.FORBIDDEN);
  }

  // Agents see a sanitised view (strip full commission breakdown per PRD §8.5)
  if (isAgent(role)) {
    return res.json({
      success: true,
      data: {
        _id:              deal._id,
        dealReference:    deal.dealReference,
        dealType:         deal.dealType,
        transactionValue: deal.transactionValue,
        commissionStatus: deal.commissionStatus,
        partnerShare:     deal.commission.partnerShare,   // only their share
        property:         deal.propertyId,
        customer:         deal.customerId,
        unit:             deal.inventoryUnitId,
        confirmedAt:      deal.confirmedAt,
        paidAt:           deal.paidAt,
        createdAt:        deal.createdAt,
        notes:            deal.notes,
      },
    });
  }

  res.json({ success: true, data: deal });
});

// ════════════════════════════════════════════════════════════════════════════
// GET ADVISOR'S OWN DEALS (PRD §7.1 My Leads / Deals)
// GET /deal-records/my-deals
// ════════════════════════════════════════════════════════════════════════════
exports.getMyDeals = asyncHandler(async (req, res) => {
  const advisorId = req.user._id;
  const { commissionStatus } = req.query;
  const { page, limit, skip } = paginate(req.query);

  const filter = { advisorId, isVoided: false };
  if (commissionStatus) filter.commissionStatus = commissionStatus;

  const [deals, total] = await Promise.all([
    DealRecord.find(filter)
      .populate('propertyId',  'propertyName area price mainLogo')
      .populate('customerId',  'firstName lastName')
      .populate('inventoryUnitId', 'unitNumber floorNumber bedroomType')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    DealRecord.countDocuments(filter),
  ]);

  // Strip commission breakdown — advisor only sees their own summary
  const sanitized = deals.map(d => ({
    _id:              d._id,
    dealReference:    d.dealReference,
    dealType:         d.dealType,
    transactionValue: d.transactionValue,
    commissionStatus: d.commissionStatus,
    property:         d.propertyId,
    customer:         d.customerId,
    unit:             d.inventoryUnitId,
    confirmedAt:      d.confirmedAt,
    paidAt:           d.paidAt,
    createdAt:        d.createdAt,
  }));

  res.json({ success: true, data: sanitized, pagination: paginationMeta(total, page, limit) });
});

// ════════════════════════════════════════════════════════════════════════════
// GET AGENCY DEALS — Agency sees all affiliated agents' deals (PRD §11.3)
// GET /deal-records/agency-deals
// ════════════════════════════════════════════════════════════════════════════
exports.getAgencyDeals = asyncHandler(async (req, res) => {
  const agencyId = req.agency?._id || req.user?._id;
  const { commissionStatus, agentId } = req.query;
  const { page, limit, skip } = paginate(req.query);

  const filter = { agencyId, isVoided: false };
  if (commissionStatus) filter.commissionStatus = commissionStatus;
  if (agentId)          filter.agentId          = agentId;

  const [deals, total] = await Promise.all([
    DealRecord.find(filter)
      .populate('propertyId', 'propertyName area price')
      .populate('agentId',    'first_name last_name email')
      .populate('customerId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    DealRecord.countDocuments(filter),
  ]);

  const commissionSummary = await DealRecord.aggregate([
    { $match: { agencyId } },
    {
      $group: {
        _id:          '$commissionStatus',
        totalPartner: { $sum: '$commission.partnerShare' },
        count:        { $sum: 1 },
      },
    },
  ]);

  res.json({
    success: true,
    data:    deals,
    commissionSummary,
    pagination: paginationMeta(total, page, limit),
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET REFERRAL PARTNER DEALS — own deals only (PRD §3.2)
// GET /deal-records/referral-deals
// ════════════════════════════════════════════════════════════════════════════
exports.getReferralDeals = asyncHandler(async (req, res) => {
  const partnerId = req.user._id;
  const { page, limit, skip } = paginate(req.query);

  const filter = { referralPartnerId: partnerId, isVoided: false };

  const [deals, total] = await Promise.all([
    DealRecord.find(filter)
      .populate('propertyId', 'propertyName area price mainLogo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    DealRecord.countDocuments(filter),
  ]);

  const sanitized = deals.map(d => ({
    _id:                      d._id,
    dealReference:            d.dealReference,
    dealType:                 d.dealType,
    commissionStatus:         d.commissionStatus,
    referralCommissionStatus: d.referralCommissionStatus,
    referralShare:            d.commission.referralShare,
    referralPaidAt:           d.referralPaidAt,
    property:                 d.propertyId,
    confirmedAt:              d.confirmedAt,
    createdAt:                d.createdAt,
  }));

  res.json({ success: true, data: sanitized, pagination: paginationMeta(total, page, limit) });
});

// ════════════════════════════════════════════════════════════════════════════
// COMMISSION STATS — Admin analytics (PRD §12.7)
// GET /deal-records/stats
// ════════════════════════════════════════════════════════════════════════════
exports.getCommissionStats = asyncHandler(async (req, res) => {
  const [byStatus, byType, monthly, flagged] = await Promise.all([
    DealRecord.aggregate([
      { $match: { isVoided: false } },
      {
        $group: {
          _id:           '$commissionStatus',
          count:         { $sum: 1 },
          totalGross:    { $sum: '$commission.grossAmount' },
          totalXoto:     { $sum: '$commission.xotoRetained' },
          totalPartner:  { $sum: '$commission.partnerShare' },
          totalReferral: { $sum: '$commission.referralShare' },
        },
      },
    ]),
    DealRecord.aggregate([
      { $match: { isVoided: false } },
      {
        $group: {
          _id:        '$dealType',
          count:      { $sum: 1 },
          avgValue:   { $avg: '$transactionValue' },
          totalGross: { $sum: '$commission.grossAmount' },
        },
      },
    ]),
    DealRecord.aggregate([
      { $match: { isVoided: false } },
      {
        $group: {
          _id: {
            year:  { $year:  '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count:      { $sum: 1 },
          totalGross: { $sum: '$commission.grossAmount' },
        },
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 },
    ]),
    DealRecord.countDocuments({ isFlagged: true, isVoided: false }),
  ]);

  res.json({
    success: true,
    data:    { byStatus, byType, monthly, flaggedCount: flagged },
  });
});
