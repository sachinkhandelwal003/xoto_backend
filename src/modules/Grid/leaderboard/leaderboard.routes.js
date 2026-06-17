const express = require('express');
const router  = express.Router();
const {
  getGlobalLeaderboard,
  getTopConverters,
  getTrustLeaderboard,
   getAgencyPerformance,
} = require('./leaderboard.controller');

// Auth middleware — same one used across your Grid routes
const { protectMulti } = require('../../../middleware/auth');


// ── GET /grid/leaderboard ─────────────────────────────────────────────────────
// Agents, Advisors, Admin — ranked by composite score
router.get('/', protectMulti, getGlobalLeaderboard);

// ── GET /grid/leaderboard/top-converters ──────────────────────────────────────
// Same access, sorted by conversion rate
router.get('/top-converters', protectMulti, getTopConverters);

// ── GET /grid/leaderboard/trust ───────────────────────────────────────────────
// Admin only — includes trustScore + complianceStatus
router.get('/trust', protectMulti, getTrustLeaderboard);

router.get('/performance', protectMulti, getAgencyPerformance);

module.exports = router;