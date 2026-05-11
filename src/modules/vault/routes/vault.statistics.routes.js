// routes/vault.statistics.routes.js

import express from 'express';
import { protect, protectPartner,protectVaultOps,protectVaultAgent,protectVaultAdvisor } from '../../../middleware/auth.js';
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
router.get('/advisor/stats', protectVaultAdvisor, getAdvisorDashboardStats);

// Ops only
router.get('/ops/stats', protectVaultOps, getOpsDashboardStats);

// Freelance Agent only
router.get('/agent/stats', protectVaultAgent, getAgentDashboardStats);

module.exports = router;