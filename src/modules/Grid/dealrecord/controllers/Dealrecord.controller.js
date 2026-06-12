'use strict';
const mongoose        = require('mongoose');
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
const { Transform }   = require('stream');

// ─── Commission calculator ────────────────────────────────────────────────────
const calcCommission = (transactionValue, grossPercent, partnerPercent, referralPercent) => {
  transactionValue = validateTransactionValue(transactionValue);
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

const validateTransactionValue = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new APIError('transactionValue must be a positive number', StatusCodes.BAD_REQUEST);
  }
  return amount;
};

const validatePercent = (value, fieldName) => {
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new APIError(`${fieldName} must be a number between 0 and 100`, StatusCodes.BAD_REQUEST);
  }
  return percent;
};

// ─── BUG FIX #1: isInternalAdvisorDeal was missing entirely ──────────────────
// PRD §12.5 — when only an advisor is linked (no external agent/agency/referral),
// Xoto retains 100% of the gross commission; no partner disbursement occurs.
const isInternalAdvisorDeal = ({ advisorId, agentId, agencyId, referralPartnerId }) => {
  return Boolean(advisorId) && !agentId && !agencyId && !referralPartnerId;
};

const getAgreementTerms = async (partnerAgreementId, { agencyId, agentId, referralPartnerId }, session = null) => {
  if (!partnerAgreementId) return null;

  const agreement = await PartnerAgreement.findById(partnerAgreementId).session(session);
  if (!agreement) throw new APIError('Partner Agreement not found', StatusCodes.NOT_FOUND);
  if (agreement.status !== 'active') {
    throw new APIError(`Partner Agreement is ${agreement.status}; only active agreements can be linked`, StatusCodes.BAD_REQUEST);
  }

  const linkedToAgency   = agencyId        && agreement.agencyId?.toString()          === agencyId.toString();
  const linkedToAgent    = agentId         && agreement.agentId?.toString()            === agentId.toString();
  const linkedToReferral = referralPartnerId && agreement.referralPartnerId?.toString() === referralPartnerId.toString();

  if (!linkedToAgency && !linkedToAgent && !linkedToReferral) {
    throw new APIError('Partner Agreement does not belong to the linked agency, agent, or referral partner', StatusCodes.BAD_REQUEST);
  }

  return {
    partnerPercent:  validatePercent(agreement.commissionSplitPercent, 'commissionSplitPercent'),
    referralPercent: validatePercent(agreement.referralSplitPercent || 0, 'referralSplitPercent'),
  };
};

const refExists = async (Model, id, label, session = null) => {
  if (!id) return null;
  const doc = await Model.findById(id).session(session);
  if (!doc) throw new APIError(`${label} not found`, StatusCodes.NOT_FOUND);
  return doc;
};

const validateDealRefs = async ({
  leadId, propertyId, customerId, advisorId, agentId,
  agencyId, inventoryUnitId,
}, session = null) => {
  const [lead, property, customer] = await Promise.all([
    refExists(GridLead,    leadId,     'Lead',     session),
    refExists(Property,    propertyId, 'Property', session),
    refExists(Customer,    customerId, 'Customer', session),
  ]);

  await Promise.all([
    refExists(GridAdvisor, advisorId, 'Advisor', session),
    refExists(Agent,       agentId,   'Agent',   session),
    refExists(Agency,      agencyId,  'Agency',  session),
  ]);

  const inventory = await refExists(Inventory, inventoryUnitId, 'Inventory unit', session);
  if (inventory && !['available', 'reserved', 'booked', 'spa_signed'].includes(inventory.status)) {
    throw new APIError(
      `Inventory unit cannot be linked - current status: ${inventory.status}`,
      StatusCodes.BAD_REQUEST
    );
  }

  return { lead, property, customer, inventory };
};

const syncLeadDealRecord = (deal, commission, session = null) => GridLead.findByIdAndUpdate(
  deal.leadId,
  {
    'deal_record.created':            true,
    'deal_record.deal_record_id':     deal._id,
    'deal_record.inventory_unit_id':  deal.inventoryUnitId || null,
    'deal_record.transaction_value':  deal.transactionValue,
    'deal_record.commission_amount':  commission.grossAmount,
    'deal_record.commission_status':  deal.commissionStatus,
    'deal_record.closed_at':          new Date(),
    ...(deal.referralPartnerId ? {
      'referral_info.referral_partner_id': deal.referralPartnerId,
      'referral_info.commission_rate':     commission.referralPercent,
      'referral_info.commission_status':   deal.referralCommissionStatus === 'not_applicable'
        ? 'pending'
        : deal.referralCommissionStatus,
    } : {}),
  },
  { session }
);

const linkInventoryToDeal = (deal, actorId, session = null) => {
  if (!deal.inventoryUnitId) return Promise.resolve();
  return Inventory.findByIdAndUpdate(
    deal.inventoryUnitId,
    {
      status:       deal.dealType === 'sale' ? 'spa_signed' : 'booked',
      soldAt:       new Date(),
      soldBy:       deal.advisorId || deal.agentId || actorId,
      dealRecordId: deal._id,
      leadId:       deal.leadId,
      salePrice:    deal.transactionValue,
    },
    { session }
  );
};

const releaseInventoryFromDeal = async (inventoryUnitId, dealId, session = null) => {
  if (!inventoryUnitId) return;
  const unit = await Inventory.findById(inventoryUnitId).session(session);
  if (!unit || unit.status === 'sold') return;
  if (unit.dealRecordId && unit.dealRecordId.toString() !== dealId.toString()) return;

  await Inventory.findByIdAndUpdate(
    inventoryUnitId,
    {
      status:       'available',
      reservedBy:   null,
      reservedAt:   null,
      bookedBy:     null,
      bookedAt:     null,
      soldBy:       null,
      soldAt:       null,
      salePrice:    0,
      dealRecordId: null,
      leadId:       null,
    },
    { session }
  );
};

const clearLeadDealRecord = (leadId, session = null) => GridLead.findByIdAndUpdate(
  leadId,
  {
    status:                          'in_discussion',
    'deal_record.created':           false,
    'deal_record.deal_record_id':    null,
    'deal_record.inventory_unit_id': null,
    'deal_record.transaction_value': null,
    'deal_record.commission_amount': null,
    'deal_record.commission_status': 'pending',
  },
  { session }
);

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
    grossPercent,
    partnerPercent  = 0,
    referralPercent = 0,
    notes,
  } = req.body;

if (!leadId || !propertyId || !customerId || !dealType || !transactionValue || !grossPercent) {
    throw new APIError(
      'leadId, propertyId, customerId, dealType, transactionValue, and grossPercent are required',
      StatusCodes.BAD_REQUEST
    );
  }

  const session = await mongoose.startSession();
  let deal;
  try {
    await session.withTransaction(async () => {

      // ── BUG FIX #2: lead checks moved inside transaction with session ─────
      const existing = await DealRecord.findOne({ leadId, isVoided: false }).session(session);
      if (existing) {
        throw new APIError(
          `A deal record already exists for this lead (${existing.dealReference})`,
          StatusCodes.CONFLICT
        );
      }

      const lead = await GridLead.findById(leadId).session(session);
      if (!lead) {
        throw new APIError('Lead not found', StatusCodes.NOT_FOUND);
      }

      const CLOSABLE_STATUSES = ['reserved', 'spa_signed'];
      if (!CLOSABLE_STATUSES.includes(lead.status)) {
        throw new APIError(
          `Deal records can only be created for leads in reserved or spa_signed status. Current: ${lead.status}`,
          StatusCodes.BAD_REQUEST
        );
      }

      if (lead?.deal_record?.created === true) {
        throw new APIError(
          'Deal record already exists for this lead',
          StatusCodes.CONFLICT
        );
      }

      await validateDealRefs({
        leadId, propertyId, customerId, advisorId, agentId, agencyId, inventoryUnitId,
      }, session);

      const agreementTerms = await getAgreementTerms(partnerAgreementId, {
        agencyId,
        agentId,
        referralPartnerId,
      }, session);

      const finalGrossPercent = validatePercent(grossPercent, 'grossPercent');

      // ── BUG FIX #3: use consistent variable names throughout ──────────────
      let finalPartnerPercent;
      let finalReferralPercent;

      if (isInternalAdvisorDeal({ advisorId, agentId, agencyId, referralPartnerId })) {
        // PRD §12.5 — full commission retained by Xoto; no partner disbursement
        finalPartnerPercent  = 0;
        finalReferralPercent = 0;
      } else if (agreementTerms) {
        finalPartnerPercent  = agreementTerms.partnerPercent;
        finalReferralPercent = agreementTerms.referralPercent;
      } else {
        finalPartnerPercent  = validatePercent(partnerPercent,  'partnerPercent');
        finalReferralPercent = validatePercent(referralPercent, 'referralPercent');
      }

      if (finalPartnerPercent + finalReferralPercent > 100) {
        throw new APIError('partnerPercent and referralPercent cannot exceed 100 combined', StatusCodes.BAD_REQUEST);
      }

      const finalTransactionValue = validateTransactionValue(transactionValue);
      const commission = calcCommission(finalTransactionValue, finalGrossPercent, finalPartnerPercent, finalReferralPercent);
      const referralCommissionStatus = referralPartnerId && commission.referralShare > 0 ? 'pending' : 'not_applicable';

      deal = new DealRecord({
        leadId,
        propertyId,
        inventoryUnitId:    inventoryUnitId    || null,
        customerId,
        advisorId:          advisorId          || null,
        agentId:            agentId            || null,
        agencyId:           agencyId           || null,
        referralPartnerId:  referralPartnerId  || null,
        partnerAgreementId: partnerAgreementId || null,
        dealType,
        transactionValue: finalTransactionValue,
        commission,
        commissionStatus: 'pending',
        referralCommissionStatus,
        notes: notes || '',
        createdBy: adminId,
      });

      pushStatusLog(deal, null, 'pending', adminId, 'Deal record created');
      await deal.save({ session });
      await syncLeadDealRecord(deal, commission, session);
      await linkInventoryToDeal(deal, adminId, session);

      if (advisorId) {
        await GridAdvisor.findByIdAndUpdate(advisorId, {
          $inc: {
            'workload.totalDealsCompleted': 1,
            'workload.activeLeadsCount':   -1,
          },
        }, { session });
      }
    });
  } catch (err) {
    if (err?.code === 11000) {
      throw new APIError('A deal record already exists for this lead', StatusCodes.CONFLICT);
    }
    throw err;
  } finally {
    session.endSession();
  }

  // Notify relevant parties about new deal record
  try {
    const { emitGridNotification } = await import('../../Notification/gridNotification.service.js');
    const actorName = req.user?.firstName || req.user?.fullName || 'Admin';

    await emitGridNotification({
      eventType: 'DEAL_CREATED',
      title: 'Deal record created',
      message: `Deal ${deal._id} created for lead ${deal.leadId}`,
      entityId: deal._id,
      entityModel: 'DealRecord',
      createdByName: actorName,
      createdByRole: 'admin',
    });

    if (deal.advisorId) {
      await emitGridNotification({
        eventType: 'DEAL_CREATED',
        title: 'Deal completed',
        message: `A deal was recorded for lead ${deal.leadId}`,
        entityId: deal._id,
        entityModel: 'DealRecord',
        recipientId: deal.advisorId,
        recipientModel: 'GridAdvisor',
        recipientRole: 'advisor',
        createdByName: actorName,
        createdByRole: 'admin',
      });
    }

    if (deal.agentId) {
      await emitGridNotification({
        eventType: 'DEAL_CREATED',
        title: 'Deal recorded',
        message: `A deal for lead ${deal.leadId} includes your agent record`,
        entityId: deal._id,
        entityModel: 'DealRecord',
        recipientId: deal.agentId,
        recipientModel: 'GridAgent',
        recipientRole: 'agent',
        createdByName: actorName,
        createdByRole: 'admin',
      });
    }

    if (deal.referralPartnerId) {
      await emitGridNotification({
        eventType: 'DEAL_CREATED',
        title: 'Referral deal recorded',
        message: `A deal for lead ${deal.leadId} credited to you as referral partner`,
        entityId: deal._id,
        entityModel: 'DealRecord',
        recipientId: deal.referralPartnerId,
        recipientModel: 'GridReferralPartner',
        recipientRole: 'referral_partner',
        createdByName: actorName,
        createdByRole: 'admin',
      });
    }
  } catch (e) {
    console.error('[GridNotification] createDealRecord notification error:', e?.message || e);
  }

  return res.status(StatusCodes.CREATED).json({
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

  const previousAdvisorId       = deal.advisorId;
  const previousInventoryUnitId = deal.inventoryUnitId;

  await validateDealRefs({
    leadId:          deal.leadId,
    propertyId:      deal.propertyId,
    customerId:      deal.customerId,
    advisorId:       updates.advisorId       ?? deal.advisorId,
    agentId:         updates.agentId         ?? deal.agentId,
    agencyId:        updates.agencyId        ?? deal.agencyId,
    inventoryUnitId: updates.inventoryUnitId ?? deal.inventoryUnitId,
  });

  Object.assign(deal, updates);
  if (updates.transactionValue !== undefined) {
    deal.transactionValue = validateTransactionValue(updates.transactionValue);
  }

  // Recalculate commission if financials changed
  const financialsChanged =
    updates.transactionValue   !== undefined ||
    updates.grossPercent       !== undefined ||
    updates.partnerPercent     !== undefined ||
    updates.referralPercent    !== undefined ||
    updates.partnerAgreementId !== undefined ||
    updates.agencyId           !== undefined ||
    updates.agentId            !== undefined ||
    updates.referralPartnerId  !== undefined;

  if (financialsChanged) {
    const agreementTerms = await getAgreementTerms(
      updates.partnerAgreementId ?? deal.partnerAgreementId,
      {
        agencyId:          updates.agencyId          ?? deal.agencyId,
        agentId:           updates.agentId           ?? deal.agentId,
        referralPartnerId: updates.referralPartnerId ?? deal.referralPartnerId,
      }
    );

    const finalGrossPercent = validatePercent(
      req.body.grossPercent ?? deal.commission.grossPercent,
      'grossPercent'
    );

    // Resolve effective IDs after applying updates
    const effectiveAdvisorId  = updates.advisorId          ?? deal.advisorId;
    const effectiveAgentId    = updates.agentId            ?? deal.agentId;
    const effectiveAgencyId   = updates.agencyId           ?? deal.agencyId;
    const effectiveReferralId = updates.referralPartnerId  ?? deal.referralPartnerId;

    // ── BUG FIX #4: use consistent variable names (no _update suffix) ──────
    let finalPartnerPercent;
    let finalReferralPercent;

    if (isInternalAdvisorDeal({
      advisorId:         effectiveAdvisorId,
      agentId:           effectiveAgentId,
      agencyId:          effectiveAgencyId,
      referralPartnerId: effectiveReferralId,
    })) {
      // PRD §12.5 — internal advisor deal; Xoto retains full commission
      finalPartnerPercent  = 0;
      finalReferralPercent = 0;
    } else if (agreementTerms) {
      finalPartnerPercent  = agreementTerms.partnerPercent;
      finalReferralPercent = agreementTerms.referralPercent;
    } else {
      finalPartnerPercent  = validatePercent(
        req.body.partnerPercent ?? deal.commission.partnerPercent,
        'partnerPercent'
      );
      finalReferralPercent = validatePercent(
        req.body.referralPercent ?? deal.commission.referralPercent,
        'referralPercent'
      );
    }

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

  deal.referralCommissionStatus =
    deal.referralPartnerId && deal.commission.referralShare > 0 ? 'pending' : 'not_applicable';

  deal.editHistory.push({
    editedBy: adminId,
    editedAt: new Date(),
    fields:   snapshot,
    reason:   req.body.editReason || '',
  });

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await deal.save({ session });
      await syncLeadDealRecord(deal, deal.commission, session);

      const invChanged =
        (previousInventoryUnitId || '').toString() !==
        (deal.inventoryUnitId   || '').toString();

      if (invChanged) {
        await releaseInventoryFromDeal(previousInventoryUnitId, deal._id, session);
        await linkInventoryToDeal(deal, adminId, session);
      } else if (deal.inventoryUnitId) {
        await linkInventoryToDeal(deal, adminId, session);
      }

      if ((previousAdvisorId || '').toString() !==
          (deal.advisorId    || '').toString()) {
        if (previousAdvisorId) {
          await GridAdvisor.findByIdAndUpdate(previousAdvisorId,
            { $inc: { 'workload.totalDealsCompleted': -1, 'workload.activeLeadsCount': 1 } },
            { session });
        }
        if (deal.advisorId) {
          await GridAdvisor.findByIdAndUpdate(deal.advisorId,
            { $inc: { 'workload.totalDealsCompleted': 1, 'workload.activeLeadsCount': -1 } },
            { session });
        }
      }
    });
  } finally {
    session.endSession();
  }

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
  await GridLead.findByIdAndUpdate(deal.leadId, {
    'deal_record.evidence_uploaded':  true,
    'deal_record.evidence_documents': deal.evidenceDocuments.map(d => ({
      doc_type:    d.docType,
      url:         d.url,
      uploaded_at: d.uploadedAt,
    })),
  });

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

  const previousStatus  = deal.commissionStatus;
  deal.commissionStatus = 'confirmed';
  deal.confirmedAt      = new Date();
  deal.confirmedBy      = adminId;
  deal.isLocked         = true;

  // ── BUG FIX #5: referral commission status logic ──────────────────────────
  // If no referral partner: not_applicable (unchanged from creation)
  // If referral partner exists AND referralShare > 0: stays 'pending' (confirmed separately via /confirm-referral)
  // If referral partner exists but share is 0: not_applicable
  if (!deal.referralPartnerId || !deal.commission?.referralShare || deal.commission.referralShare <= 0) {
    deal.referralCommissionStatus = 'not_applicable';
  }
  // else: referralCommissionStatus remains 'pending' — admin must call /confirm-referral separately

  pushStatusLog(deal, previousStatus, 'confirmed', adminId, req.body.note || '');
  await deal.save();

  await GridLead.findByIdAndUpdate(deal.leadId, {
    status:                         'completed',
    'deal_record.commission_status': 'confirmed',
    ...(deal.referralPartnerId && deal.referralCommissionStatus !== 'not_applicable' ? {
      'referral_info.commission_status': deal.referralCommissionStatus,
    } : {}),
  });

  // Mark inventory as sold (sale type only — lease stays booked until confirmed)
  if (deal.inventoryUnitId) {
    await Inventory.findByIdAndUpdate(deal.inventoryUnitId, {
      status: deal.dealType === 'sale' ? 'sold' : 'booked',
    });
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
  await GridLead.findByIdAndUpdate(deal.leadId, {
    'deal_record.commission_status': 'paid',
  });

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
// CONFIRM REFERRAL COMMISSION — Admin only (PRD §3.2, §12.5)
// Flow: referralCommissionStatus: pending → confirmed
//       Main commissionStatus must already be 'confirmed' or 'paid'
// PATCH /deal-records/:id/confirm-referral
// ════════════════════════════════════════════════════════════════════════════
exports.confirmReferralCommission = asyncHandler(async (req, res) => {
  const adminId = req.user._id;

  const deal = await DealRecord.findById(req.params.id);
  if (!deal) throw new APIError('Deal record not found', StatusCodes.NOT_FOUND);

  if (deal.isVoided) {
    throw new APIError('Cannot confirm referral commission on a voided deal', StatusCodes.BAD_REQUEST);
  }

  if (!deal.referralPartnerId) {
    throw new APIError('No referral partner is linked to this deal', StatusCodes.BAD_REQUEST);
  }

  if (!['confirmed', 'paid'].includes(deal.commissionStatus)) {
    throw new APIError(
      `Main deal commission must be confirmed before confirming referral commission. ` +
      `Current deal status: ${deal.commissionStatus}`,
      StatusCodes.BAD_REQUEST
    );
  }

  if (deal.referralCommissionStatus !== 'pending') {
    throw new APIError(
      `Referral commission cannot be confirmed from its current status: ` +
      `${deal.referralCommissionStatus}. Expected: pending`,
      StatusCodes.BAD_REQUEST
    );
  }

  if (!deal.commission?.referralShare || deal.commission.referralShare <= 0) {
    throw new APIError(
      'Referral commission amount is zero — nothing to confirm. ' +
      'Check the commission split on this deal record.',
      StatusCodes.BAD_REQUEST
    );
  }

  const previousStatus          = deal.referralCommissionStatus;
  deal.referralCommissionStatus = 'confirmed';

  pushStatusLog(deal, `referral_${previousStatus}`, 'referral_confirmed', adminId, req.body.note || '');
  await deal.save();

  try {
    await GridLead.findByIdAndUpdate(deal.leadId, {
      'referral_info.commission_status': 'confirmed',
    });
  } catch (err) {
    console.warn('[DealRecord] confirmReferralCommission: lead sync failed:', err.message);
  }

  return res.json({
    success: true,
    message: 'Referral commission confirmed — record is now eligible for payout',
    data: {
      dealReference:            deal.dealReference,
      referralPartnerId:        deal.referralPartnerId,
      referralCommissionStatus: deal.referralCommissionStatus,
      referralShare:            deal.commission.referralShare,
      mainCommissionStatus:     deal.commissionStatus,
    },
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MARK REFERRAL COMMISSION AS PAID — Admin only (PRD §12.5)
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

  if (deal.commissionStatus === 'paid') {
    throw new APIError(
      'Cannot void a deal after commission has been marked as paid. ' +
      'Commission ledger integrity must be preserved (PRD §14.4). ' +
      'If this deal requires correction, please escalate to Xoto finance team.',
      StatusCodes.FORBIDDEN
    );
  }

  if (deal.referralCommissionStatus === 'paid') {
    throw new APIError(
      'Cannot void a deal after referral commission has been marked as paid. ' +
      'Referral payout ledger integrity must be preserved (PRD §14.4). ' +
      'If this deal requires correction, please escalate to Xoto finance team.',
      StatusCodes.FORBIDDEN
    );
  }

  // ── BUG FIX #6: void side-effects inside a transaction for atomicity ─────
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      deal.isVoided   = true;
      deal.voidReason = reason;
      deal.voidedBy   = req.user._id;
      deal.voidedAt   = new Date();

      pushStatusLog(deal, deal.commissionStatus, 'voided', req.user._id, reason);
      await deal.save({ session });

      await releaseInventoryFromDeal(deal.inventoryUnitId, deal._id, session);
      await clearLeadDealRecord(deal.leadId, session);
    });
  } finally {
    session.endSession();
  }

  res.json({
    success: true,
    message: 'Deal record voided',
    data: { dealReference: deal.dealReference, voidedAt: deal.voidedAt },
  });
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
  if (isFlagged   !== undefined) filter.isFlagged   = isFlagged   === 'true';
  if (isVoided    !== undefined) filter.isVoided    = isVoided    === 'true';
  if (isEscalated !== undefined) filter.isEscalated = isEscalated === 'true';

  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate)   filter.createdAt.$lte = new Date(toDate);
  }

  const sortDir = sortOrder === 'asc' ? 1 : -1;

  const [deals, total] = await Promise.all([
    DealRecord.find(filter)
      .populate('leadId',             'contact_info classification lead_type source')
      .populate('propertyId',         'propertyName area city propertySubType price mainLogo')
      .populate('customerId',         'firstName lastName phone email')
      .populate('advisorId',          'firstName lastName email phone employeeId')
      .populate('agentId',            'first_name last_name email phone_number')
      .populate('agencyId',           'companyName primaryContactEmail')
      .populate('referralPartnerId',  'firstName lastName phone')
      .populate('inventoryUnitId',    'unitNumber floorNumber unitType bedroomType price status')
      .populate('createdBy',          'firstName lastName email')
      .populate('partnerAgreementId', 'commissionSplitPercent effectiveDate status')
      .sort({ createdAt: sortDir })
      .skip(skip)
      .limit(limit),
    DealRecord.countDocuments(filter),
  ]);

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
    data:       deals,
    pagination: paginationMeta(total, page, limit),
    summary,
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET SINGLE DEAL RECORD (PRD §10.4)
// GET /deal-records/:id
// ════════════════════════════════════════════════════════════════════════════
exports.getDealRecordById = asyncHandler(async (req, res) => {
  const { role, _id: userId } = req.user;

  const deal = await DealRecord.findById(req.params.id)
    .populate('leadId')
    .populate('propertyId',         'propertyName area city propertySubType price mainLogo completionDate')
    .populate('customerId',         'firstName lastName phone email')
    .populate('advisorId',          'firstName lastName email phone employeeId department')
    .populate('agentId',            'first_name last_name email phone_number operating_city')
    .populate('agencyId',           'companyName primaryContactName primaryContactEmail')
    .populate('referralPartnerId',  'firstName lastName phone email')
    .populate('inventoryUnitId')
    .populate('partnerAgreementId')
    .populate('createdBy',          'firstName lastName email')
    .populate('confirmedBy',        'firstName lastName email')
    .populate('paidBy',             'firstName lastName email');

  if (!deal) throw new APIError('Deal record not found', StatusCodes.NOT_FOUND);

  if (isAdvisor(role)) {
    const ownsDeal = deal.advisorId && deal.advisorId._id?.toString() === userId.toString();
    if (!ownsDeal) throw new APIError('You can only view your own deal records', StatusCodes.FORBIDDEN);
  }

  if (isAgent(role)) {
    const ownsDeal = deal.agentId && deal.agentId._id?.toString() === userId.toString();
    if (!ownsDeal) throw new APIError('You can only view your own deal records', StatusCodes.FORBIDDEN);
  }

  if (isAgent(role)) {
    return res.json({
      success: true,
      data: {
        _id:              deal._id,
        dealReference:    deal.dealReference,
        dealType:         deal.dealType,
        transactionValue: deal.transactionValue,
        commissionStatus: deal.commissionStatus,
        partnerShare:     deal.commission.partnerShare,
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
// GET ADVISOR'S OWN DEALS (PRD §7.1)
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
      .populate('propertyId',      'propertyName area price mainLogo')
      .populate('customerId',      'firstName lastName')
      .populate('inventoryUnitId', 'unitNumber floorNumber bedroomType')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    DealRecord.countDocuments(filter),
  ]);

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
// GET AGENCY DEALS (PRD §11.3)
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

  res.json({ success: true, data: deals, commissionSummary, pagination: paginationMeta(total, page, limit) });
});

// ════════════════════════════════════════════════════════════════════════════
// GET REFERRAL PARTNER DEALS (PRD §3.2)
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
    data: { byStatus, byType, monthly, flaggedCount: flagged },
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET AGENT'S OWN DEALS (PRD §8.2)
// GET /deal-records/my-agent-deals
// ════════════════════════════════════════════════════════════════════════════
exports.getMyAgentDeals = asyncHandler(async (req, res) => {
  const agentId = req.user._id;
  const { commissionStatus } = req.query;
  const { page, limit, skip } = paginate(req.query);

  const filter = { agentId, isVoided: false };
  if (commissionStatus) filter.commissionStatus = commissionStatus;

  const [deals, total] = await Promise.all([
    DealRecord.find(filter)
      .populate('propertyId',      'propertyName area price mainLogo')
      .populate('customerId',      'firstName lastName')
      .populate('inventoryUnitId', 'unitNumber floorNumber bedroomType')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    DealRecord.countDocuments(filter),
  ]);

  const sanitized = deals.map(d => ({
    _id:              d._id,
    dealReference:    d.dealReference,
    dealType:         d.dealType,
    transactionValue: d.transactionValue,
    commissionStatus: d.commissionStatus,
    partnerShare:     d.commission.partnerShare,
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
// CSV EXPORT (PRD §12.5)
// GET /deal-records/export
// ════════════════════════════════════════════════════════════════════════════
const csvCell = (val) => {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const csvRow = (cells) => cells.map(csvCell).join(',') + '\r\n';

const COLUMNS = [
  { header: 'Deal Reference',       value: d => d.dealReference },
  { header: 'Deal Type',            value: d => d.dealType },
  { header: 'Transaction Value',    value: d => d.transactionValue },
  { header: 'Currency',             value: d => d.currency },
  { header: 'Property',             value: d => d.propertyId?.propertyName || d.propertyId?.toString() },
  { header: 'Area',                 value: d => d.propertyId?.area },
  { header: 'City',                 value: d => d.propertyId?.city },
  { header: 'Unit Number',          value: d => d.inventoryUnitId?.unitNumber },
  { header: 'Customer Name',        value: d => [d.customerId?.firstName, d.customerId?.lastName].filter(Boolean).join(' ') },
  { header: 'Customer Phone',       value: d => d.customerId?.phone },
  { header: 'Advisor',              value: d => [d.advisorId?.firstName, d.advisorId?.lastName].filter(Boolean).join(' ') },
  { header: 'Agent',                value: d => [d.agentId?.first_name, d.agentId?.last_name].filter(Boolean).join(' ') },
  { header: 'Agency',               value: d => d.agencyId?.companyName },
  { header: 'Referral Partner',     value: d => [d.referralPartnerId?.firstName, d.referralPartnerId?.lastName].filter(Boolean).join(' ') },
  { header: 'Gross Commission',     value: d => d.commission?.grossAmount },
  { header: 'Gross %',              value: d => d.commission?.grossPercent },
  { header: 'Xoto Retained',        value: d => d.commission?.xotoRetained },
  { header: 'Xoto %',               value: d => d.commission?.xotoPercent },
  { header: 'Partner Share',        value: d => d.commission?.partnerShare },
  { header: 'Partner %',            value: d => d.commission?.partnerPercent },
  { header: 'Referral Share',       value: d => d.commission?.referralShare },
  { header: 'Referral %',           value: d => d.commission?.referralPercent },
  { header: 'Commission Status',    value: d => d.commissionStatus },
  { header: 'Referral Comm Status', value: d => d.referralCommissionStatus },
  { header: 'Confirmed At',         value: d => d.confirmedAt  ? new Date(d.confirmedAt).toISOString()  : '' },
  { header: 'Confirmed By',         value: d => [d.confirmedBy?.firstName, d.confirmedBy?.lastName].filter(Boolean).join(' ') },
  { header: 'Paid At',              value: d => d.paidAt       ? new Date(d.paidAt).toISOString()       : '' },
  { header: 'Referral Paid At',     value: d => d.referralPaidAt ? new Date(d.referralPaidAt).toISOString() : '' },
  { header: 'Is Flagged',           value: d => d.isFlagged    ? 'Yes' : 'No' },
  { header: 'Flag Reason',          value: d => d.flagReason },
  { header: 'Is Voided',            value: d => d.isVoided     ? 'Yes' : 'No' },
  { header: 'Void Reason',          value: d => d.voidReason },
  { header: 'Is Escalated',         value: d => d.isEscalated  ? 'Yes' : 'No' },
  { header: 'Partner Agreement',    value: d => d.partnerAgreementId?._id?.toString() },
  { header: 'Notes',                value: d => d.notes },
  { header: 'Created At',           value: d => new Date(d.createdAt).toISOString() },
  { header: 'Created By',           value: d => [d.createdBy?.firstName, d.createdBy?.lastName].filter(Boolean).join(' ') },
];

const buildExportFilter = (query) => {
  const {
    commissionStatus, agentId, agencyId, advisorId,
    dealType, fromDate, toDate,
    isFlagged, isVoided, isEscalated,
    referralPartnerId, propertyId,
  } = query;

  const filter = {};
  if (commissionStatus)  filter.commissionStatus  = commissionStatus;
  if (agentId)           filter.agentId           = agentId;
  if (agencyId)          filter.agencyId          = agencyId;
  if (advisorId)         filter.advisorId         = advisorId;
  if (dealType)          filter.dealType          = dealType;
  if (referralPartnerId) filter.referralPartnerId = referralPartnerId;
  if (propertyId)        filter.propertyId        = propertyId;
  if (isFlagged   !== undefined) filter.isFlagged   = isFlagged   === 'true';
  if (isVoided    !== undefined) filter.isVoided    = isVoided    === 'true';
  if (isEscalated !== undefined) filter.isEscalated = isEscalated === 'true';
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate)   filter.createdAt.$lte = new Date(toDate);
  }
  return filter;
};

const buildFilename = (query) => {
  const parts = ['xoto-commission-export'];
  if (query.commissionStatus) parts.push(query.commissionStatus);
  if (query.dealType)         parts.push(query.dealType);
  if (query.fromDate)         parts.push(`from-${query.fromDate.slice(0, 10)}`);
  if (query.toDate)           parts.push(`to-${query.toDate.slice(0, 10)}`);
  parts.push(new Date().toISOString().slice(0, 10));
  return parts.join('_') + '.csv';
};

exports.exportDealRecords = asyncHandler(async (req, res) => {
  const filter   = buildExportFilter(req.query);
  const sortDir  = req.query.sortOrder === 'asc' ? 1 : -1;
  const filename = buildFilename(req.query);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  res.write('\uFEFF');
  res.write(csvRow(COLUMNS.map(c => c.header)));

  const cursor = DealRecord
    .find(filter)
    .populate('propertyId',         'propertyName area city')
    .populate('customerId',         'firstName lastName phone')
    .populate('advisorId',          'firstName lastName')
    .populate('agentId',            'first_name last_name')
    .populate('agencyId',           'companyName')
    .populate('referralPartnerId',  'firstName lastName')
    .populate('inventoryUnitId',    'unitNumber')
    .populate('confirmedBy',        'firstName lastName')
    .populate('createdBy',          'firstName lastName')
    .populate('partnerAgreementId', '_id')
    .sort({ createdAt: sortDir })
    .lean()
    .cursor();

  let rowCount = 0;

  const csvTransform = new Transform({
    objectMode: true,
    transform(deal, _enc, done) {
      try {
        this.push(csvRow(COLUMNS.map(col => col.value(deal))));
        rowCount++;
        done();
      } catch (err) {
        done(err);
      }
    },
  });

  await new Promise((resolve, reject) => {
    cursor
      .pipe(csvTransform)
      .pipe(res, { end: false })
      .on('finish', resolve)
      .on('error', reject);

    cursor.on('error', reject);
    csvTransform.on('error', reject);
  });

  console.info(
    `[DealRecord Export] user=${req.user._id} rows=${rowCount} ` +
    `filter=${JSON.stringify(filter)} file=${filename}`
  );

  res.end();
});

exports.getAgencyDeals = asyncHandler(async (req, res) => {
  // Support both agency-session and user-session shapes
  const agencyId = req.agency?._id || req.user?._id;
 
  if (!agencyId) {
    throw new APIError('Agency identity could not be resolved', StatusCodes.UNAUTHORIZED);
  }
 
  const {
    commissionStatus,
    referralCommissionStatus,
    agentId,
    dealType,
    fromDate,
    toDate,
    isFlagged,
    sortOrder = 'desc',
  } = req.query;
 
  const { page, limit, skip } = paginate(req.query);
 
  // ── Build filter ──────────────────────────────────────────────────────────
  const filter = {
    agencyId,
    isVoided: false,
  };
 
  if (commissionStatus)          filter.commissionStatus          = commissionStatus;
  if (referralCommissionStatus)  filter.referralCommissionStatus  = referralCommissionStatus;
  if (agentId)                   filter.agentId                   = agentId;
  if (dealType)                  filter.dealType                  = dealType;
  if (isFlagged !== undefined)   filter.isFlagged                 = isFlagged === 'true';
 
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate)   filter.createdAt.$lte = new Date(toDate);
  }
 
  const sortDir = sortOrder === 'asc' ? 1 : -1;
 
  // ── Parallel fetch: paginated list + total count + commission summary ─────
  const [deals, total, commissionSummary] = await Promise.all([
    DealRecord.find(filter)
      .populate('propertyId',  'propertyName area city price mainLogo')
      .populate('customerId',  'firstName lastName')
      .populate('agentId',     'first_name last_name email phone_number')
      .populate('advisorId',   'firstName lastName')
      .populate('inventoryUnitId', 'unitNumber floorNumber bedroomType')
      .populate('partnerAgreementId', 'commissionSplitPercent effectiveDate')
      .sort({ createdAt: sortDir })
      .skip(skip)
      .limit(limit)
      .lean(),
 
    DealRecord.countDocuments(filter),
 
    // Commission totals bucketed by status — scoped to this agency
    DealRecord.aggregate([
      { $match: { agencyId: new mongoose.Types.ObjectId(String(agencyId)), isVoided: false } },
      {
        $group: {
          _id:          '$commissionStatus',
          count:        { $sum: 1 },
          totalPartner: { $sum: '$commission.partnerShare' },
          totalGross:   { $sum: '$commission.grossAmount' },
        },
      },
    ]),
  ]);
 
  // ── Shape summary into a flat object for easier frontend consumption ──────
  const summaryMap = { pending: 0, confirmed: 0, paid: 0 };
  const countMap   = { pending: 0, confirmed: 0, paid: 0 };
  commissionSummary.forEach(({ _id, totalPartner, count }) => {
    if (_id in summaryMap) {
      summaryMap[_id] = totalPartner;
      countMap[_id]   = count;
    }
  });
  const totalEarned = summaryMap.pending + summaryMap.confirmed + summaryMap.paid;
 
  return res.json({
    success: true,
    data:    deals,
    pagination: paginationMeta(total, page, limit),
    summary: {
      totalEarned,
      pending:   { amount: summaryMap.pending,   count: countMap.pending   },
      confirmed: { amount: summaryMap.confirmed, count: countMap.confirmed },
      paid:      { amount: summaryMap.paid,      count: countMap.paid      },
    },
  });
});
 
// ════════════════════════════════════════════════════════════════════════════
// GET AGENCY STATS  (PRD §12.7 scoped to agency)
// GET /deal-records/agency-stats
//
// Dashboard-level analytics: deal counts by type, monthly trend (last 12m),
// top agent by commission.  No customer PII is exposed.
// ════════════════════════════════════════════════════════════════════════════
exports.getAgencyStats = asyncHandler(async (req, res) => {
  const agencyId = req.agency?._id || req.user?._id;
 
  if (!agencyId) {
    throw new APIError('Agency identity could not be resolved', StatusCodes.UNAUTHORIZED);
  }
 
  const agencyObjId = new mongoose.Types.ObjectId(String(agencyId));
  const baseMatch   = { agencyId: agencyObjId, isVoided: false };
 
  const [byStatus, byType, monthly, byAgent] = await Promise.all([
    // 1 — Commission totals by status
    DealRecord.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id:          '$commissionStatus',
          count:        { $sum: 1 },
          totalPartner: { $sum: '$commission.partnerShare' },
          totalGross:   { $sum: '$commission.grossAmount' },
        },
      },
    ]),
 
    // 2 — Deal count + value by deal type (sale vs lease)
    DealRecord.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id:          '$dealType',
          count:        { $sum: 1 },
          avgValue:     { $avg: '$transactionValue' },
          totalGross:   { $sum: '$commission.grossAmount' },
          totalPartner: { $sum: '$commission.partnerShare' },
        },
      },
    ]),
 
    // 3 — Monthly trend: last 12 months
    DealRecord.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: {
            year:  { $year:  '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count:        { $sum: 1 },
          totalPartner: { $sum: '$commission.partnerShare' },
        },
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 },
    ]),
 
    // 4 — Per-agent commission breakdown (top performers)
    DealRecord.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id:          '$agentId',
          totalDeals:   { $sum: 1 },
          totalPartner: { $sum: '$commission.partnerShare' },
          paidDeals:    { $sum: { $cond: [{ $eq: ['$commissionStatus', 'paid'] }, 1, 0] } },
          pendingAmt:   { $sum: { $cond: [{ $eq: ['$commissionStatus', 'pending']   }, '$commission.partnerShare', 0] } },
          confirmedAmt: { $sum: { $cond: [{ $eq: ['$commissionStatus', 'confirmed'] }, '$commission.partnerShare', 0] } },
          paidAmt:      { $sum: { $cond: [{ $eq: ['$commissionStatus', 'paid']      }, '$commission.partnerShare', 0] } },
        },
      },
      { $sort: { totalPartner: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from:         Agent.collection.name,
          localField:   '_id',
          foreignField: '_id',
          as:           'agent',
        },
      },
      { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id:          1,
          totalDeals:   1,
          totalPartner: 1,
          paidDeals:    1,
          pendingAmt:   1,
          confirmedAmt: 1,
          paidAmt:      1,
          agentName: {
            $concat: [
              { $ifNull: ['$agent.first_name', ''] },
              ' ',
              { $ifNull: ['$agent.last_name',  ''] },
            ],
          },
          agentEmail: '$agent.email',
        },
      },
    ]),
  ]);
 
  return res.json({
    success: true,
    data: { byStatus, byType, monthly, byAgent },
  });
});
 
// ════════════════════════════════════════════════════════════════════════════
// GET AGENCY AGENT SUMMARY  (PRD §11.2 Agent Team section)
// GET /deal-records/agency-agent-summary
//
// Returns one summary row per affiliated agent — deal counts + commission
// totals. Useful for the Agent Team leaderboard card in the agency panel.
// ════════════════════════════════════════════════════════════════════════════
exports.getAgencyAgentSummary = asyncHandler(async (req, res) => {
  const agencyId = req.agency?._id || req.user?._id;
 
  if (!agencyId) {
    throw new APIError('Agency identity could not be resolved', StatusCodes.UNAUTHORIZED);
  }
 
  const agencyObjId = new mongoose.Types.ObjectId(String(agencyId));
 
  const summary = await DealRecord.aggregate([
    { $match: { agencyId: agencyObjId, isVoided: false } },
    {
      $group: {
        _id:          '$agentId',
        totalDeals:   { $sum: 1 },
        totalPartner: { $sum: '$commission.partnerShare' },
        paidAmt:      { $sum: { $cond: [{ $eq: ['$commissionStatus', 'paid']      }, '$commission.partnerShare', 0] } },
        confirmedAmt: { $sum: { $cond: [{ $eq: ['$commissionStatus', 'confirmed'] }, '$commission.partnerShare', 0] } },
        pendingAmt:   { $sum: { $cond: [{ $eq: ['$commissionStatus', 'pending']   }, '$commission.partnerShare', 0] } },
        lastDealAt:   { $max: '$createdAt' },
        saleDeals:    { $sum: { $cond: [{ $eq: ['$dealType', 'sale']  }, 1, 0] } },
        leaseDeals:   { $sum: { $cond: [{ $eq: ['$dealType', 'lease'] }, 1, 0] } },
      },
    },
    { $sort: { totalPartner: -1 } },
    {
      $lookup: {
        from:         Agent.collection.name,
        localField:   '_id',
        foreignField: '_id',
        as:           'agent',
      },
    },
    { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id:          1,
        totalDeals:   1,
        totalPartner: 1,
        paidAmt:      1,
        confirmedAmt: 1,
        pendingAmt:   1,
        lastDealAt:   1,
        saleDeals:    1,
        leaseDeals:   1,
        agentName: {
          $concat: [
            { $ifNull: ['$agent.first_name', ''] },
            ' ',
            { $ifNull: ['$agent.last_name', ''] },
          ],
        },
        agentEmail:  '$agent.email',
        agentPhone:  '$agent.phone_number',
      },
    },
  ]);
 
  return res.json({
    success: true,
    data:    summary,
  });
});
