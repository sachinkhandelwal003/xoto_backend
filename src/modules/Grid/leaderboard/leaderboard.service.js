const mongoose   = require('mongoose');
const GridLead   = require('../../Grid/Lead/model/gridLead.model');
const DealRecord = require('.././dealrecord/models/Dealrecord.model');
const Agent      = require('../../Grid/Agent/models/agent');
const Advisor    = require('../../Grid/Advisor/model/index');

// ─── Date window helper ───────────────────────────────────────────────────────
const getDateWindow = (range) => {
  const days = { weekly: 7, monthly: 30, quarterly: 90, annual: 365 }[range] || 30;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return { start, days };
};

// ─── PRD §8.1 Score formulas ──────────────────────────────────────────────────
const calcAgentScore = (closedDeals, conversionRate, tenureMonths) => {
  const dealsComponent      = (Math.min(closedDeals, 20) / 20) * 100 * 0.3;
  const conversionComponent = conversionRate * 0.4;
  const tenureComponent     = (Math.min(tenureMonths, 36) / 36) * 100 * 0.3;
  return Math.round(dealsComponent + conversionComponent + tenureComponent);
};

const calcAdvisorScore = (closedDeals, conversionRate, avgResponseTimeHrs) => {
  const dealsComponent      = (Math.min(closedDeals, 20) / 20) * 100 * 0.3;
  const conversionComponent = conversionRate * 0.4;
  const rt = avgResponseTimeHrs != null ? avgResponseTimeHrs : 48;
  const responseComponent   = (1 - Math.min(rt, 48) / 48) * 100 * 0.3;
  return Math.round(dealsComponent + conversionComponent + responseComponent);
};

// ─── Aggregate lead stats per user ───────────────────────────────────────────
const aggregateLeadStats = async (userIds, dateStart, userIdField) => {
  const rows = await GridLead.aggregate([
    {
      $match: {
        [userIdField]: { $in: userIds },
        is_deleted:    false,
        createdAt:     { $gte: dateStart },
      },
    },
    {
      $group: {
        _id:          `$${userIdField}`,
        totalLeads:   { $sum: 1 },
        closedDeals:  { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
      },
    },
  ]);
  return new Map(rows.map(r => [String(r._id), r]));
};

// ─── Aggregate deal-record commissions per user ───────────────────────────────
const aggregateDealCommission = async (userIds, dateStart, field) => {
  const rows = await DealRecord.aggregate([
    {
      $match: {
        [field]:          { $in: userIds },
        isVoided:         false,
        commissionStatus: { $in: ['confirmed', 'paid'] },
        createdAt:        { $gte: dateStart },
      },
    },
    {
      $group: {
        _id:              `$${field}`,
        totalCommission:  { $sum: '$commission.partnerShare' },
        dealsClosed:      { $sum: 1 },
      },
    },
  ]);
  return new Map(rows.map(r => [String(r._id), r]));
};

// ════════════════════════════════════════════════════════════════════════════
// SERVICE 1 — getGlobalLeaderboard
// Returns merged agent + advisor list ranked by composite score
// Supports: range, page, limit, role ('agent'|'advisor'), search (name)
// ════════════════════════════════════════════════════════════════════════════
exports.getGlobalLeaderboard = async ({ range = 'monthly', page = 1, limit = 20, role = null, search = null } = {}) => {
  const { start } = getDateWindow(range);
  const skip = (page - 1) * limit;

  // ── Build query filters ────────────────────────────────────────────────────
  const agentQuery = { isActive: true };
  const advisorQuery = { status: { $in: ['active', 'inactive'] } };

  // Role filter
  if (role === 'agent') {
    // Only agents
    advisorQuery._id = null; // will return empty for advisors
  } else if (role === 'advisor') {
    agentQuery._id = null; // only advisors
  }

  // Search by name
  if (search) {
    const regex = new RegExp(search, 'i');
    agentQuery.$or = [
      { fullName: regex },
      { first_name: regex },
      { last_name: regex },
    ];
    advisorQuery.$or = [
      { firstName: regex },
      { lastName: regex },
    ];
  }

  // ── Fetch agents and advisors ──────────────────────────────────────────────
  const [agents, advisors] = await Promise.all([
    Agent.find(agentQuery)
      .select('_id first_name last_name fullName profile_photo operating_city specialization createdAt adminApprovalStatus agencyApprovalStatus')
      .lean(),
    Advisor.find(advisorQuery)
      .select('_id firstName lastName profilePhotoUrl location specialisation createdAt leaderboard status')
      .lean(),
  ]);

  const agentIds   = agents.map(a => a._id);
  const advisorIds = advisors.map(a => a._id);

  // ── Aggregate stats ─────────────────────────────────────────────────────────
  const [agentLeadMap, advisorLeadMap, agentDealMap, advisorDealMap] = await Promise.all([
    aggregateLeadStats(agentIds,   start, 'created_by_agent'),
    aggregateLeadStats(advisorIds, start, 'assigned_to'),
    aggregateDealCommission(agentIds,   start, 'agentId'),
    aggregateDealCommission(advisorIds, start, 'advisorId'),
  ]);

  // ── Build rows ──────────────────────────────────────────────────────────────
  const rows = [];

  // Process agents
  for (const agent of agents) {
    const id         = String(agent._id);
    const leadStats  = agentLeadMap.get(id)  || { totalLeads: 0, closedDeals: 0 };
    const dealStats  = agentDealMap.get(id)  || { totalCommission: 0, dealsClosed: 0 };
    const closedDeals    = Math.max(leadStats.closedDeals, dealStats.dealsClosed);
    const totalLeads     = leadStats.totalLeads || 0;
    const conversionRate = totalLeads > 0 ? Math.round((closedDeals / totalLeads) * 100) : 0;
    const tenureMonths   = Math.floor((Date.now() - new Date(agent.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30));
    const score          = calcAgentScore(closedDeals, conversionRate, tenureMonths);

    rows.push({
      _id:            agent._id,
      name:           agent.fullName || `${agent.first_name} ${agent.last_name}`.trim(),
      avatar:         agent.profile_photo || null,
      role:           'agent',
      roleCode:       16,
      location:       agent.operating_city || null,
      totalLeads,
      closedDeals,
      conversionRate,
      commissionEarned: dealStats.totalCommission || 0,
      tenureMonths,
      score,
    });
  }

  // Process advisors
  for (const advisor of advisors) {
    const id          = String(advisor._id);
    const leadStats   = advisorLeadMap.get(id) || { totalLeads: 0, closedDeals: 0 };
    const dealStats   = advisorDealMap.get(id) || { totalCommission: 0, dealsClosed: 0 };
    const closedDeals     = Math.max(leadStats.closedDeals, dealStats.dealsClosed);
    const totalLeads      = leadStats.totalLeads || 0;
    const conversionRate  = totalLeads > 0 ? Math.round((closedDeals / totalLeads) * 100) : 0;
    const avgResponseTime = advisor.leaderboard?.avgResponseTimeHrs ?? null;
    const score           = calcAdvisorScore(closedDeals, conversionRate, avgResponseTime);

    rows.push({
      _id:             advisor._id,
      name:            `${advisor.firstName} ${advisor.lastName}`.trim(),
      avatar:          advisor.profilePhotoUrl || null,
      role:            'advisor',
      roleCode:        24,
      location:        advisor.location || null,
      totalLeads,
      closedDeals,
      conversionRate,
      commissionEarned:  dealStats.totalCommission || 0,
      avgResponseTimeHrs: avgResponseTime,
      score,
    });
  }

  // ── Sort by score desc, assign rank ──────────────────────────────────────
  rows.sort((a, b) => b.score - a.score || b.closedDeals - a.closedDeals);
  rows.forEach((r, i) => { r.rank = i + 1; });

  const total     = rows.length;
  const paginated = rows.slice(skip, skip + limit);

  return {
    data:       paginated,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

// ════════════════════════════════════════════════════════════════════════════
// SERVICE 2 — getTopConverters
// ════════════════════════════════════════════════════════════════════════════
exports.getTopConverters = async ({ range = 'monthly', page = 1, limit = 20 } = {}) => {
  const result = await exports.getGlobalLeaderboard({ range, page: 1, limit: 9999 });

  result.data.sort((a, b) => b.conversionRate - a.conversionRate || b.closedDeals - a.closedDeals);
  result.data.forEach((r, i) => { r.rank = i + 1; });

  const skip      = (page - 1) * limit;
  const paginated = result.data.slice(skip, skip + limit);

  return {
    data:       paginated,
    total:      result.total,
    page,
    limit,
    totalPages: Math.ceil(result.total / limit),
  };
};

// ════════════════════════════════════════════════════════════════════════════
// SERVICE 3 — getTrustLeaderboard (Admin only)
// ════════════════════════════════════════════════════════════════════════════
exports.getTrustLeaderboard = async ({ range = 'monthly', page = 1, limit = 20 } = {}) => {
  const result = await exports.getGlobalLeaderboard({ range, page: 1, limit: 9999 });

  const agentIds   = result.data.filter(r => r.role === 'agent').map(r => r._id);
  const advisorIds = result.data.filter(r => r.role === 'advisor').map(r => r._id);

  const [agentDocs, advisorDocs] = await Promise.all([
    Agent.find({ _id: { $in: agentIds } })
      .select('_id reraCardUrl emiratesIdUrl bankDetails isFlagged')
      .lean(),
    Advisor.find({ _id: { $in: advisorIds } })
      .select('_id leaderboard identity bankDetails isFlagged deactivationReason')
      .lean(),
  ]);

  const agentMap   = new Map(agentDocs.map(a => [String(a._id), a]));
  const advisorMap = new Map(advisorDocs.map(a => [String(a._id), a]));

  result.data.forEach(row => {
    if (row.role === 'agent') {
      const doc = agentMap.get(String(row._id)) || {};
      const hasRera  = !!doc.reraCardUrl;
      const hasId    = !!doc.emiratesIdUrl;
      const hasBank  = !!(doc.bankDetails?.iban);
      const flagged  = !!doc.isFlagged;
      const trustScore = Math.round(
        (hasRera ? 33 : 0) + (hasId ? 33 : 0) + (hasBank ? 34 : 0) - (flagged ? 20 : 0)
      );
      row.trustScore       = Math.max(0, trustScore);
      row.complianceStatus = flagged ? 'flagged' : (trustScore >= 80 ? 'compliant' : 'incomplete');
    } else {
      const doc = advisorMap.get(String(row._id)) || {};
      const compositeScore = doc.leaderboard?.compositeScore || 0;
      const hasId   = !!(doc.identity?.isVerified);
      const hasBank = !!(doc.bankDetails?.isVerified);
      const flagged = !!doc.isFlagged;
      row.trustScore       = Math.max(0, Math.round(compositeScore - (flagged ? 20 : 0)));
      row.complianceStatus = flagged ? 'flagged' : (hasId && hasBank ? 'compliant' : 'incomplete');
    }
  });

  result.data.sort((a, b) => b.trustScore - a.trustScore);
  result.data.forEach((r, i) => { r.rank = i + 1; });

  const skip      = (page - 1) * limit;
  const paginated = result.data.slice(skip, skip + limit);

  return {
    data:       paginated,
    total:      result.total,
    page,
    limit,
    totalPages: Math.ceil(result.total / limit),
  };
};

// ════════════════════════════════════════════════════════════════════════════
// SERVICE 4 — getAgencyLeaderboard
// ════════════════════════════════════════════════════════════════════════════
exports.getAgencyLeaderboard = async ({ agencyId, range = 'monthly', page = 1, limit = 20 } = {}) => {
  if (!agencyId) {
    throw new Error('agencyId is required');
  }

  const { start } = getDateWindow(range);
  const skip = (page - 1) * limit;

  const agents = await Agent.find({
    agency: new mongoose.Types.ObjectId(agencyId),
    isActive: true,
  })
    .select('_id first_name last_name fullName email profile_photo createdAt reraStatus adminApprovalStatus')
    .lean();

  if (!agents.length) {
    return {
      data: [],
      total: 0,
      page,
      limit,
      totalPages: 0,
    };
  }

  const agentIds = agents.map(a => a._id);

  const [leadStats, dealStats] = await Promise.all([
    GridLead.aggregate([
      { $match: { created_by_agent: { $in: agentIds }, is_deleted: false, createdAt: { $gte: start } } },
      { $group: { _id: '$created_by_agent', totalLeads: { $sum: 1 }, activeLeads: { $sum: { $cond: [{ $not: { $in: ['$status', ['completed', 'not_proceeding']] } }, 1, 0] } } } },
    ]),
    DealRecord.aggregate([
      { $match: { agentId: { $in: agentIds }, isVoided: false, commissionStatus: { $in: ['confirmed', 'paid'] }, createdAt: { $gte: start } } },
      { $group: { _id: '$agentId', totalCommission: { $sum: '$commission.partnerShare' } } },
    ]),
  ]);

  const leadMap = new Map(leadStats.map(l => [String(l._id), l]));
  const dealMap = new Map(dealStats.map(d => [String(d._id), d]));

  const rows = agents.map(agent => {
    const id = String(agent._id);
    const leads = leadMap.get(id) || { totalLeads: 0, activeLeads: 0 };
    const deals = dealMap.get(id) || { totalCommission: 0 };

    const normalizedCommission = Math.min((deals.totalCommission || 0) / 10000, 100);
    const score = (leads.totalLeads * 0.3) + (leads.activeLeads * 0.3) + (normalizedCommission * 0.4);

    return {
      _id: agent._id,
      name: agent.fullName || `${agent.first_name || ''} ${agent.last_name || ''}`.trim() || 'Agent',
      email: agent.email || '-',
      profile_photo: agent.profile_photo || null,
      createdAt: agent.createdAt,
      reraStatus: agent.reraStatus || 'not_submitted',
      totalLeads: leads.totalLeads || 0,
      activeLeads: leads.activeLeads || 0,
      listingsCreated: 0,
      commissionEarned: Math.round((deals.totalCommission || 0) * 100) / 100,
      _score: score,
    };
  });

  rows.sort((a, b) => b._score - a._score || b.totalLeads - a.totalLeads);
  let rank = 1;
  rows.forEach((item, index) => {
    if (index > 0 && item._score < rows[index - 1]._score) {
      rank = index + 1;
    }
    item.rank = rank;
  });
  rows.forEach(item => delete item._score);

  const total = rows.length;
  const paginated = rows.slice(skip, skip + limit);

  return {
    data: paginated,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};