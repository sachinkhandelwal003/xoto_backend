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
//
// Agent  : Score = (Deals Closed * 0.3) + (Conversion Rate * 0.4) + (Tenure * 0.3)
// Advisor: Score = (Deals Closed * 0.3) + (Conversion Rate * 0.4) + (Response Time * 0.3)
//          → lower responseTime is better; normalised as (1 - min(rt,48)/48) * 100
//
const calcAgentScore = (closedDeals, conversionRate, tenureMonths) => {
  const dealsComponent      = (Math.min(closedDeals, 20) / 20) * 100 * 0.3;
  const conversionComponent = conversionRate * 0.4;
  const tenureComponent     = (Math.min(tenureMonths, 36) / 36) * 100 * 0.3;
  return Math.round(dealsComponent + conversionComponent + tenureComponent);
};

const calcAdvisorScore = (closedDeals, conversionRate, avgResponseTimeHrs) => {
  const dealsComponent      = (Math.min(closedDeals, 20) / 20) * 100 * 0.3;
  const conversionComponent = conversionRate * 0.4;
  // Faster response → higher score. Cap at 48 hrs; 0 hrs = 100, 48+ hrs = 0
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
  // keyed by userId string
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
// ════════════════════════════════════════════════════════════════════════════
exports.getGlobalLeaderboard = async ({ range = 'monthly', page = 1, limit = 20 } = {}) => {
  const { start } = getDateWindow(range);
  const skip = (page - 1) * limit;

  // ── Fetch active agents ───────────────────────────────────────────────────
  const agents = await Agent.find({
    agencyApprovalStatus: 'approved',
    adminApprovalStatus:  'approved',
    isActive:             true,
  })
    .select('_id first_name last_name fullName profile_photo operating_city specialization createdAt')
    .lean();

  // ── Fetch active advisors ─────────────────────────────────────────────────
  const advisors = await Advisor.find({ status: 'active' })
    .select('_id firstName lastName profilePhotoUrl location specialisation createdAt leaderboard')
    .lean();

  const agentIds   = agents.map(a => a._id);
  const advisorIds = advisors.map(a => a._id);

  // ── Lead stats in parallel ────────────────────────────────────────────────
  const [agentLeadMap, advisorLeadMap, agentDealMap, advisorDealMap] = await Promise.all([
    aggregateLeadStats(agentIds,   start, 'created_by_agent'),
    aggregateLeadStats(advisorIds, start, 'assigned_to'),
    aggregateDealCommission(agentIds,   start, 'agentId'),
    aggregateDealCommission(advisorIds, start, 'advisorId'),
  ]);

  // ── Build rows ────────────────────────────────────────────────────────────
  const rows = [];

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
// Same as global but sorted by conversion rate desc
// ════════════════════════════════════════════════════════════════════════════
exports.getTopConverters = async ({ range = 'monthly', page = 1, limit = 20 } = {}) => {
  const result = await exports.getGlobalLeaderboard({ range, page: 1, limit: 9999 });

  // Re-sort by conversion rate desc
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
// Adds trustScore + complianceStatus columns
// trustScore = advisors: leaderboard.compositeScore, agents: derived from docs
// ════════════════════════════════════════════════════════════════════════════
exports.getTrustLeaderboard = async ({ range = 'monthly', page = 1, limit = 20 } = {}) => {
  const result = await exports.getGlobalLeaderboard({ range, page: 1, limit: 9999 });

  // Enrich with trust data
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

  // Sort by trustScore desc
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
// Returns leaderboard for agents belonging to a specific agency
// Fields: rank, name, email, profile_photo, createdAt, reraStatus,
//         totalLeads, activeLeads, listingsCreated, commissionEarned
// ════════════════════════════════════════════════════════════════════════════
exports.getAgencyLeaderboard = async ({ agencyId, range = 'monthly', page = 1, limit = 20 } = {}) => {
  if (!agencyId) {
    throw new Error('agencyId is required');
  }

  const { start } = getDateWindow(range);
  const skip = (page - 1) * limit;

  // ── 1. Fetch active agents belonging to this agency ──────────────────────
  const agents = await Agent.find({
    agencyId: new mongoose.Types.ObjectId(agencyId),
    adminApprovalStatus: 'approved',
    isActive: true,
  })
    .select('_id first_name last_name fullName email profile_photo createdAt reraStatus')
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

  // ── 2. Aggregate leads per agent (total and active) ──────────────────────
  const leadStats = await GridLead.aggregate([
    {
      $match: {
        created_by_agent: { $in: agentIds },
        is_deleted: false,
        createdAt: { $gte: start },
      },
    },
    {
      $group: {
        _id: '$created_by_agent',
        totalLeads: { $sum: 1 },
        activeLeads: {
          $sum: {
            $cond: [
              { $not: { $in: ['$status', ['completed', 'not_proceeding']] } },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  // ── 3. Aggregate commission from confirmed/paid deals ────────────────────
  const dealStats = await DealRecord.aggregate([
    {
      $match: {
        agentId: { $in: agentIds },
        isVoided: false,
        commissionStatus: { $in: ['confirmed', 'paid'] },
        createdAt: { $gte: start },
      },
    },
    {
      $group: {
        _id: '$agentId',
        totalCommission: { $sum: '$commission.partnerShare' },
      },
    },
  ]);

  // ── 4. (Optional) Aggregate listings created – if you have a property model with agentId
  //    For now we set listingsCreated = 0 (since agents cannot create listings per PRD)
  //    If you later add a property model with agent reference, you can add aggregation here.

  // ── 5. Build result ──────────────────────────────────────────────────────────
  const leadMap = new Map(leadStats.map(l => [String(l._id), l]));
  const dealMap = new Map(dealStats.map(d => [String(d._id), d]));

  const rows = agents.map(agent => {
    const id = String(agent._id);
    const leads = leadMap.get(id) || { totalLeads: 0, activeLeads: 0 };
    const deals = dealMap.get(id) || { totalCommission: 0 };

    // Compute a composite score for ranking: 30% totalLeads, 30% activeLeads, 40% commission (normalised)
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
      listingsCreated: 0, // Placeholder – adjust if you have a property model
      commissionEarned: Math.round((deals.totalCommission || 0) * 100) / 100,
      _score: score, // internal use for sorting
    };
  });

  // ── 6. Sort by score desc, assign ranks ──────────────────────────────────
  rows.sort((a, b) => b._score - a._score || b.totalLeads - a.totalLeads);

  let rank = 1;
  rows.forEach((item, index) => {
    if (index > 0 && item._score < rows[index - 1]._score) {
      rank = index + 1;
    }
    item.rank = rank;
  });

  // Remove internal _score
  rows.forEach(item => delete item._score);

  // ── 7. Paginate ────────────────────────────────────────────────────────────
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