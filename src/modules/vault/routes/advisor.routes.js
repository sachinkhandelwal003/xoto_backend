// routes/xotoAdvisor.routes.js
import express from 'express';
import {
  createXotoAdvisor,
  getAllXotoAdvisors,
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
  changeAdvisorPassword
} from '../controllers/xotoAdvisor.controller.js';

import { protect } from '../../../middleware/auth.js';

const router = express.Router();

// ==================== ADMIN ONLY ====================
router.post('/create', protect, createXotoAdvisor);
router.get('/all', protect, getAllXotoAdvisors);
router.get('/workload', protect, getAdvisorWorkload);
router.post('/assign-lead', protect, assignLeadToAdvisor);
router.post('/suspend/:id', protect, suspendAdvisor);
router.post('/activate/:id', protect, activateAdvisor);
router.delete('/delete/:id', protect, deleteAdvisor);

// ==================== PUBLIC ====================
router.post('/login', advisorLogin);

// ==================== SELF (Advisor Only) ====================
router.get('/me', protect, getAdvisorProfile);
router.get('/dashboard', protect, getAdvisorDashboard);
router.get('/my-leads', protect, getMyLeads);
router.put('/lead/:leadId/status', protect, updateLeadStatus);
router.put('/profile', protect, updateAdvisorProfile);
router.post('/change-password', protect, changeAdvisorPassword);

module.exports = router;  