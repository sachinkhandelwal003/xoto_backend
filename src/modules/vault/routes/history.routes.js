const express = require('express');
const {
  getEntityHistory,
  getUserTimeline,
  getDashboardSummary,
  getStatistics,
  searchHistory,
  deleteHistory,
  cleanupOldHistory,
} = require('../controllers/history.controller');
const { protect, protectAdmin } = require('../../../middleware/auth');

const router = express.Router();

// ==================== PUBLIC / AUTHENTICATED ROUTES ====================
router.get('/entity/:entityType/:entityId', protect, getEntityHistory);
router.get('/user/:userId', protect, getUserTimeline);
router.get('/dashboard-summary', protect, getDashboardSummary);
router.get('/search', protect, searchHistory);
router.get('/statistics', protectAdmin, getStatistics);

// ==================== ADMIN ONLY ROUTES ====================
router.delete('/delete/:id', protectAdmin, deleteHistory);
router.post('/cleanup', protectAdmin, cleanupOldHistory);

module.exports = router;