// routes/xotoAdvisor.routes.js
import express from 'express';
import {
  createXotoAdvisor,
  getAllXotoAdvisors,
  getAdvisorsForAssignment,
  getAdvisorWorkload,
  assignLeadToAdvisor,
  advisorLogin,
  getMyLeads,
  updateLeadStatus,
  getAdvisorDashboard,
  suspendAdvisor,
  activateAdvisor,
  deleteAdvisor,
  getAdvisorProfile,
  updateAdvisorProfile,
  changeAdvisorPassword,getXotoAdvisorById
} from '../controllers/xotoAdvisor.controller.js';

import { protect, protectVaultAdvisor } from '../../../middleware/auth.js';

const router = express.Router();

// ==================== ADMIN ONLY ====================
router.post('/create', protect, createXotoAdvisor);
router.get('/all', protect, getAllXotoAdvisors);
router.get('/get/:id', protect, getXotoAdvisorById);

router.get('/workload', protect, getAdvisorWorkload);
router.get('/for-assignment', protect, getAdvisorsForAssignment);
router.post('/assign-lead', protect, assignLeadToAdvisor);
router.post('/suspend/:id', protect, suspendAdvisor);
router.post('/activate/:id', protect, activateAdvisor);
router.delete('/delete/:id', protect, deleteAdvisor);

// ==================== PUBLIC ====================
router.post('/login', advisorLogin);

// ==================== SELF (Advisor Only) ====================
router.get('/me', protectVaultAdvisor, getAdvisorProfile);
router.get('/dashboard', protectVaultAdvisor, getAdvisorDashboard);
router.get('/my-leads', protectVaultAdvisor, getMyLeads);
router.put('/lead/:leadId/status', protectVaultAdvisor, updateLeadStatus);
router.put('/profile', protectVaultAdvisor, updateAdvisorProfile);
router.post('/change-password', protectVaultAdvisor, changeAdvisorPassword);

module.exports = router;  