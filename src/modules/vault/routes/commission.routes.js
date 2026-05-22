// routes/commission.routes.js

import express from 'express';
import { 
  previewCommission,
  createCommissionFromCase,
  createCommission, 
  confirmCommission, 
  markCommissionAsPaid, 
  processCommissionPayment,
  getMyCommissions, 
  getPartnerCommissions, 
  adminGetAllCommissions,
  getCommissionById
} from '../controllers/commission.controller.js';
import { protect, protectPartner,protectMulti } from '../../../middleware/auth.js';

const router = express.Router();

// ==================== SELF ROUTES (Freelance Agent & Partner) ====================
router.get('/my', protectMulti, getMyCommissions);

// ==================== PARTNER ROUTES ====================
router.get('/partner', protectPartner, getPartnerCommissions);

// ==================== ADMIN ROUTES ====================
// Preview commission before creation
router.post('/admin/preview/:caseId', protect, previewCommission);

// Create commission from disbursed case
router.post('/admin/create-from-case/:caseId', protect, createCommissionFromCase);
router.post('/admin/create', protect, createCommission);

// Manage commission
router.post('/admin/:id/confirm', protect, confirmCommission);
router.post('/admin/:id/pay', protect, markCommissionAsPaid);
router.post('/admin/:id/process-payment', protect, processCommissionPayment);

// View commissions
router.get('/admin/all', protect, adminGetAllCommissions);
router.get('/admin/:id', protect, getCommissionById);

module.exports = router; 