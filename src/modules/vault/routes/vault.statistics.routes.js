// routes/vault.statistics.routes.js

import express from 'express';
import { protect, protectPartner,protectVaultOps,protectVaultAgent } from '../../../middleware/auth.js';
import {
  getAdminDashboardStats,
  getPartnerDashboardStats,
  getAdvisorDashboardStats,
  getOpsDashboardStats,
  getAgentDashboardStats,
  getDashboardStatsByRole
} from '../controllers/vault.statistics.controller.js';

const router = express.Router();

// ==================== ROLE-BASED DASHBOARD (Single API) ====================
// This API automatically returns stats based on logged-in user's role
router.get('/dashboard', protect, getDashboardStatsByRole);

// ==================== SEPARATE APIs (For direct access) ====================
// Admin only
router.get('/admin/stats', protect, getAdminDashboardStats);

// Partner only
router.get('/partner/stats', protectPartner, getPartnerDashboardStats);

// Advisor only
router.get('/advisor/stats', protect, getAdvisorDashboardStats);

// Ops only
router.get('/ops/stats', protect, getOpsDashboardStats);

// Freelance Agent only
router.get('/agent/stats', protect, getAgentDashboardStats);

module.exports = router;