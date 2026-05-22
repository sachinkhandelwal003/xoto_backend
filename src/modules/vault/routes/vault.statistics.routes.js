import express from 'express';
import { protect, protectPartner, protectVaultOps, protectVaultAgent, protectVaultAdvisor } from '../../../middleware/auth.js';
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
router.get('/dashboard', protect, getDashboardStatsByRole);

// ==================== SEPARATE APIs (For direct access) ====================
router.get('/admin/stats', protect, getAdminDashboardStats);
router.get('/partner/stats', protectPartner, getPartnerDashboardStats);
router.get('/advisor/stats', protectVaultAdvisor, getAdvisorDashboardStats);
router.get('/ops/stats', protectVaultOps, getOpsDashboardStats);
router.get('/agent/stats', protectVaultAgent, getAgentDashboardStats);

module.exports = router;