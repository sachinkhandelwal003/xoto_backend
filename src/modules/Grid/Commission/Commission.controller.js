const GridLead = require('../Lead/model/gridLead.model');
const GridAgent = require('../Agent/models/agent');
const DealRecord = require('../dealrecord/models/Dealrecord.model');
const asyncHandler = require('../../../utils/asyncHandler');
const { StatusCodes } = require('../../../utils/constants/statusCodes');
const GridNotification = require('../../Grid/Notification/GridNotificationmodal').default;
const isAdmin = (user) => {
  if (user.role?.isSuperAdmin) return true;
  if (user.role?.code === '1' || user.role?.code === 1) return true;
  if (user.role?.code === '0' || user.role?.code === 0) return true;
  if (user.role?.name?.toLowerCase() === 'admin') return true;  // ← add this
  return false;
};
// ─────────────────────────────────────────────────────────────────────────────
// GET /commissions
// Works for: Admin, Agency, ReferralPartner
// The user's role and ID from the token are used to filter automatically
// ─────────────────────────────────────────────────────────────────────────────
exports.getCommissions = asyncHandler(async (req, res) => {
  const { role, id } = req.user;              // from JWT middleware (protect)
  const { page = 1, limit = 10, status, search } = req.query;

  const baseFilter = {
    status: 'completed',                        // only closed deals
    'deal_record.commission_amount': { $exists: true, $ne: null },
  };

  // ── Role‑specific filtering ───────────────────────────────────────────
  if (role === 'gridreferralpartner') {
    baseFilter.referred_by_partner = id;
  } else if (role === 'agency') {
    // Get all agents that belong to this agency
    try {
      const agents = await GridAgent.find({ agencyId: id }).select('_id').lean();
      const agentIds = agents.map(a => a._id);
      baseFilter.created_by_agent = { $in: agentIds };
    } catch (err) {
      // If GridAgent model doesn’t exist, skip agency filter and return empty
      baseFilter.created_by_agent = null;
    }
  }
  // Admin sees everything – no extra filter

  // Optional commission status filter
  if (status && status !== 'all') {
    baseFilter['deal_record.commission_status'] = status;
  }

  // Optional client search
  if (search) {
    baseFilter.$or = [
      { 'contact_info.name.first_name': { $regex: search, $options: 'i' } },
      { 'contact_info.name.last_name':  { $regex: search, $options: 'i' } },
      { 'contact_info.mobile.number':   { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [leads, total] = await Promise.all([
    GridLead.find(baseFilter)
      .populate('source.listing_id', 'propertyName')
      .populate('created_by_agent', 'firstName lastName agencyId')
      .populate('referred_by_partner', 'firstName lastName')
      .sort({ 'deal_record.closed_at': -1, updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    GridLead.countDocuments(baseFilter),
  ]);

  // ── Aggregate stats ───────────────────────────────────────────────────
  const stats = await GridLead.aggregate([
    { $match: baseFilter },
    {
      $group: {
        _id: '$deal_record.commission_status',
        totalAmount: { $sum: '$deal_record.commission_amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  const statsObj = { pending: 0, confirmed: 0, paid: 0 };
  let totalPool = 0;
  stats.forEach(s => {
    statsObj[s._id] = s.totalAmount;
    totalPool += s.totalAmount;
  });

  // ── Format the response ───────────────────────────────────────────────
  const formattedLeads = leads.map(l => ({
    _id: l._id,
    dealId: l._id.toString().slice(-6).toUpperCase(),
    clientName: l.contact_info?.name
      ? `${l.contact_info.name.first_name || ''} ${l.contact_info.name.last_name || ''}`.trim()
      : 'Unknown',
    propertyName: l.source?.listing_id?.propertyName || '—',
    transactionValue: l.deal_record?.transaction_value || 0,
    commissionRate: l.referral_info?.commission_rate || null,
    commissionAmount: l.deal_record?.commission_amount || 0,
    commissionStatus: l.deal_record?.commission_status || 'pending',
    agentName: l.created_by_agent
      ? `${l.created_by_agent.firstName || ''} ${l.created_by_agent.lastName || ''}`.trim()
      : '—',
    agencyName: l.created_by_agent?.agencyId?.name || null,   // adjust if agency is populated
    partnerName: l.referred_by_partner
      ? `${l.referred_by_partner.firstName || ''} ${l.referred_by_partner.lastName || ''}`.trim()
      : null,
    closedAt: l.deal_record?.closed_at || l.updatedAt,
  }));

  res.status(200).json({
    success: true,
    stats: { totalPool, ...statsObj },
    data: formattedLeads,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /commissions/:id/status
// Only Admin can change the status (role check is done in routes)
// Delegates to DealRecord to enforce evidence check (PRD §8.5) and keep
// both models in sync — no bypassing via this shortcut endpoint.
// ─────────────────────────────────────────────────────────────────────────────
exports.updateCommissionStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['confirmed', 'paid'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Status must be "confirmed" or "paid"' });
  }

  const lead = await GridLead.findById(id);
  if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

  if (!lead.deal_record?.created) {
    return res.status(400).json({ success: false, message: 'No deal record found on this lead' });
  }

  // Load the authoritative DealRecord — this is the source of truth
  const deal = await DealRecord.findById(lead.deal_record.deal_record_id);
  if (!deal) {
    return res.status(404).json({ success: false, message: 'Deal record not found' });
  }

  if (deal.isVoided) {
    return res.status(400).json({ success: false, message: 'Cannot update a voided deal record' });
  }

  if (status === 'confirmed') {
    if (deal.commissionStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Deal is already ${deal.commissionStatus} — cannot re-confirm`,
      });
    }
    // PRD §8.5 — evidence upload is mandatory before confirmation
    if (!deal.evidenceUploaded || deal.evidenceDocuments.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Evidence (SPA or booking form) must be uploaded before confirming commission (PRD §8.5)',
      });
    }
    deal.commissionStatus = 'confirmed';
    deal.confirmedAt      = new Date();
    deal.confirmedBy      = req.user._id;
    deal.isLocked         = true;
  }

  if (status === 'paid') {
    if (deal.commissionStatus !== 'confirmed') {
      return res.status(400).json({
        success: false,
        message: 'Deal must be confirmed before marking as paid',
      });
    }
    deal.commissionStatus = 'paid';
    deal.paidAt           = new Date();
    deal.paidBy           = req.user._id;
  }

  await deal.save();

  // Sync status back to GridLead so both stay consistent
  lead.deal_record.commission_status = status;
  if (status === 'paid') lead.deal_record.commission_paid_at = new Date();
  await lead.save();
await GridNotification.create({
  eventType:     status === 'confirmed' ? 'COMMISSION_CONFIRMED' : 'COMMISSION_PAID',
  title:         status === 'confirmed' ? 'Commission Confirmed 💰' : 'Commission Paid ✅',
  message:       `Commission ${status} for lead ${id}. Amount: AED ${lead.deal_record.commission_amount?.toLocaleString() || 0}.`,
  entityId:      lead._id,
  entityModel:   'GridLead',
  recipientId:   null,
  recipientRole: 'admin',
  createdByName: 'Admin',
  createdByRole: 'admin',
});
  res.json({
    success: true,
    message: `Commission status updated to ${status}`,
    data: { _id: lead._id, commissionStatus: deal.commissionStatus },
  });
});