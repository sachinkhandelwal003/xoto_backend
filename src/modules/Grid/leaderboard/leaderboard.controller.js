const leaderboardService = require('./leaderboard.service');

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

    const result = await leaderboardService.getGlobalLeaderboard({ range, page, limit });

    // Tag current user's entry
    const currentUserId = String(req.user._id);
    result.data.forEach((row) => {
      row.isCurrentUser = String(row._id) === currentUserId;
    });

    // Find current user's rank across all pages
    const allResult = await leaderboardService.getGlobalLeaderboard({ range, page: 1, limit: 9999 });
    const myEntry = allResult.data.find((r) => String(r._id) === currentUserId);

    return res.status(200).json({
      success: true,
      range,
      data: result.data,
      myRank: myEntry ? { rank: myEntry.rank, score: myEntry.score } : null,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
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

    const result = await leaderboardService.getTopConverters({ range, page, limit });

    // Tag current user's entry
    const currentUserId = String(req.user._id);
    result.data.forEach((row) => {
      row.isCurrentUser = String(row._id) === currentUserId;
    });

    return res.status(200).json({
      success: true,
      range,
      data: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
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

    const result = await leaderboardService.getTrustLeaderboard({ range, page, limit });

    return res.status(200).json({
      success: true,
      range,
      data: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (err) {
    console.error('[TrustLeaderboard]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /grid/leaderboard/performance
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
    const agencyId = req.user.agencyId || req.user._id;
    if (!agencyId) {
      return res.status(400).json({
        success: false,
        message: 'Agency ID not found for this user.',
      });
    }

    const range = req.query.range || 'monthly';
    const { page, limit } = getPagination(req.query);

    // 3. Call the service with a single options object (correct signature)
    const result = await leaderboardService.getAgencyLeaderboard({
      agencyId,
      range,
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    console.error('[AgencyLeaderboard]', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};