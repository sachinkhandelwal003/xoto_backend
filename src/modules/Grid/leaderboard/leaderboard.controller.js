const User = require('../../auth/models/user/user.model');
const Lead = require('../Lead/model/gridLead.model');
const DealRecord = require('../dealrecord/models/Dealrecord.model');
const { getAgencyLeaderboard } = require('./leaderboard.service');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Determine if the user has admin privileges */
const isAdmin = (role) => {
  if (!role) return false;
  if (typeof role === 'object') {
    return (
      role?.isSuperAdmin === true ||
      Number(role?.code) === 0 ||
      Number(role?.code) === 1
    );
  }
  return ['xoto_super_admin', 'xoto_staff_admin'].includes(role);
};

/** Parse pagination parameters from query string */
const getPagination = (query) => ({
  page: Math.max(1, parseInt(query.page) || 1),
  limit: Math.min(100, Math.max(1, parseInt(query.limit) || 20)),
});

/** Get start date for a given range */
const getDateRange = (range) => {
  const now = new Date();
  let start;
  switch (range) {
    case 'weekly':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'monthly':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'quarterly':
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case 'annual':
      start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // default: monthly
      break;
  }
  return start;
};

/** Compute composite score based on user role */
const computeScore = (user, totalLeads, completedLeads, closedDeals) => {
  const conversionRate = totalLeads > 0 ? (completedLeads / totalLeads) * 100 : 0;
  const dealsWeight = closedDeals || 0;

  let score = 0;
  const roleCode = user.role?.code || '16';

  if (roleCode === '16') {
    // Agent: 30% deals, 40% conversion, 30% tenure
    const tenureMonths = user.tenureMonths || 0;
    const tenureWeight = Math.min(tenureMonths / 12, 1) * 100; // cap at 12 months
    score = dealsWeight * 0.3 + conversionRate * 0.4 + tenureWeight * 0.3;
  } else if (roleCode === '24' || roleCode === '26') {
    // Advisor: 30% deals, 40% conversion, 30% response time (inverted)
    const avgResponseTime = user.responseTimeAvg || 0;
    const responseScore = Math.max(0, 100 - avgResponseTime); // faster = higher
    score = dealsWeight * 0.3 + conversionRate * 0.4 + responseScore * 0.3;
  } else {
    // Fallback for other roles
    score = dealsWeight * 0.3 + conversionRate * 0.4 + 0.3 * 50;
  }

  return Math.round(score);
};

/** Build the raw leaderboard data (array of objects) for all agents/advisors */
const buildLeaderboardData = async (startDate, includeTrust = false) => {
  // 1. Fetch all active agents/advisors
  const users = await User.find(
    {
      'role.code': { $in: ['16', '24', '26'] },
      accountStatus: 'active',
    },
    // include trust fields if needed
    includeTrust
      ? '_id name profilePhoto role.code tenureMonths responseTimeAvg trustScore complianceStatus'
      : '_id name profilePhoto role.code tenureMonths responseTimeAvg'
  ).lean();

  if (!users.length) return [];

  const userIds = users.map((u) => u._id);

  // 2. Aggregate leads per user within the date range
  const leadStats = await Lead.aggregate([
    {
      $match: {
        assignedTo: { $in: userIds },
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: '$assignedTo',
        totalLeads: { $sum: 1 },
        completedLeads: {
          $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] },
        },
      },
    },
  ]);

  // 3. Aggregate confirmed deals per user within the date range
  const dealStats = await DealRecord.aggregate([
    {
      $match: {
        agentId: { $in: userIds },
        status: 'Confirmed',
        completedAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: '$agentId',
        closedDeals: { $sum: 1 },
      },
    },
  ]);

  // 4. Combine data
  const leaderboard = users.map((user) => {
    const lead = leadStats.find(
      (l) => l._id.toString() === user._id.toString()
    ) || { totalLeads: 0, completedLeads: 0 };
    const deal = dealStats.find(
      (d) => d._id.toString() === user._id.toString()
    ) || { closedDeals: 0 };

    const totalLeads = lead.totalLeads || 0;
    const completedLeads = lead.completedLeads || 0;
    const closedDeals = deal.closedDeals || 0;
    const conversionRate =
      totalLeads > 0 ? (completedLeads / totalLeads) * 100 : 0;

    const score = computeScore(user, totalLeads, completedLeads, closedDeals);

    const base = {
      _id: user._id,
      name: user.name,
      profilePhoto: user.profilePhoto || null,
      totalLeads,
      conversionRate: Math.round(conversionRate * 100) / 100,
      closedDeals,
      score,
    };

    if (includeTrust) {
      base.trustScore = user.trustScore || 0;
      base.complianceStatus = user.complianceStatus || 'pending';
    }

    return base;
  });

  return leaderboard;
};

// ════════════════════════════════════════════════════════════════════════════
// EXPORTED CONTROLLERS
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /grid/leaderboard
 * Access: Agent (role 16), Advisor (role 24/26), Admin (role 0/1)
 * Returns: All agents + advisors ranked by composite score (descending)
 */
exports.getGlobalLeaderboard = async (req, res) => {
  try {
    const range = req.query.range || 'monthly';
    const { page, limit } = getPagination(req.query);

    const startDate = getDateRange(range);
    const rawData = await buildLeaderboardData(startDate, false);

    // Sort by score descending
    rawData.sort((a, b) => b.score - a.score);

    // Assign ranks
    let rank = 1;
    rawData.forEach((item, index) => {
      if (index > 0 && item.score < rawData[index - 1].score) {
        rank = index + 1;
      }
      item.rank = rank;
    });

    // Paginate
    const total = rawData.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const paginatedData = rawData.slice(start, start + limit);

    // Tag current user
    const currentUserId = String(req.user._id);
    paginatedData.forEach((row) => {
      row.isCurrentUser = String(row._id) === currentUserId;
    });

    // Find current user's rank (may not be on current page)
    const myEntry = rawData.find((r) => String(r._id) === currentUserId);

    return res.status(200).json({
      success: true,
      range,
      data: paginatedData,
      myRank: myEntry
        ? { rank: myEntry.rank, score: myEntry.score }
        : null,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (err) {
    console.error('[GlobalLeaderboard]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /grid/leaderboard/top-converters
 * Access: Agent, Advisor, Admin
 * Returns: Same list sorted by conversion rate descending
 */
exports.getTopConverters = async (req, res) => {
  try {
    const range = req.query.range || 'monthly';
    const { page, limit } = getPagination(req.query);

    const startDate = getDateRange(range);
    const rawData = await buildLeaderboardData(startDate, false);

    // Sort by conversion rate descending
    rawData.sort((a, b) => b.conversionRate - a.conversionRate);

    // Assign ranks
    let rank = 1;
    rawData.forEach((item, index) => {
      if (index > 0 && item.conversionRate < rawData[index - 1].conversionRate) {
        rank = index + 1;
      }
      item.rank = rank;
    });

    // Paginate
    const total = rawData.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const paginatedData = rawData.slice(start, start + limit);

    // Tag current user
    const currentUserId = String(req.user._id);
    paginatedData.forEach((row) => {
      row.isCurrentUser = String(row._id) === currentUserId;
    });

    return res.status(200).json({
      success: true,
      range,
      data: paginatedData,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (err) {
    console.error('[TopConverters]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /grid/leaderboard/trust
 * Access: Admin ONLY
 * Returns: Full list with trustScore + complianceStatus columns
 */
exports.getTrustLeaderboard = async (req, res) => {
  try {
    // Admin check
    if (!isAdmin(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Trust leaderboard is restricted to admin only',
      });
    }

    const range = req.query.range || 'monthly';
    const { page, limit } = getPagination(req.query);

    const startDate = getDateRange(range);
    const rawData = await buildLeaderboardData(startDate, true);

    // Sort by trustScore descending, then by composite score
    rawData.sort((a, b) => b.trustScore - a.trustScore || b.score - a.score);

    // Assign ranks
    let rank = 1;
    rawData.forEach((item, index) => {
      if (index > 0 && item.trustScore < rawData[index - 1].trustScore) {
        rank = index + 1;
      }
      item.rank = rank;
    });

    // Paginate
    const total = rawData.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const paginatedData = rawData.slice(start, start + limit);

    return res.status(200).json({
      success: true,
      range,
      data: paginatedData,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (err) {
    console.error('[TrustLeaderboard]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
/**
 * GET /agency/performance
 * Access: Agency Admin (role 15)
 * Returns: Leaderboard of all agents affiliated with the agency.
 */
exports.getAgencyPerformance = async (req, res) => {
  try {
    // 1. Ensure the user is an agency admin
    const roleCode = req.user?.role?.code;
    if (Number(roleCode) !== 15) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Agency admin only.',
      });
    }

    // 2. Get agencyId from the authenticated user
    //    (This must be set during login, e.g., in the JWT or from a relation)
    const agencyId = req.user.agencyId;
    if (!agencyId) {
      return res.status(400).json({
        success: false,
        message: 'Agency ID not found for this user.',
      });
    }

    // 3. Optional: add range/pagination if needed (agency leaderboard may not need range)
    const range = req.query.range || 'monthly'; // can be used for filtering
    const { page, limit } = getPagination(req.query);

    // 4. Call the service
    const leaderboard = await getAgencyLeaderboard(agencyId, { range, page, limit });

    return res.status(200).json({
      success: true,
      data: { leaderboard },
    });
  } catch (error) {
    console.error('[AgencyLeaderboard]', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};