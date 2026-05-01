// routes/commission.routes.js

import express from 'express';
import { 
  previewCommission,
  createCommissionFromCase,
  createCommission, 
  confirmCommission, 
  markCommissionAsPaid, 
  getMyCommissions, 
  getPartnerCommissions, 
  adminGetAllCommissions,
  getCommissionById
} from '../controllers/commission.controller.js';
import { protect, protectPartner,protectMulti } from '../../../middleware/auth.js';

const router = express.Router();

// ==================== PUBLIC / SELF ROUTES ====================
router.get('/my', protect, getMyCommissions);

// ==================== PARTNER ROUTES ====================
router.get('/partner', protect, getPartnerCommissions);

// ==================== ADMIN ROUTES ====================
// Preview commission calculation
router.post('/admin/preview/:caseId', protect, previewCommission);

// Create commission from disbursed case
router.post('/admin/create-from-case/:caseId', protect, createCommissionFromCase);

// Auto create commission
router.post('/admin/create', protect, createCommission);

// Confirm commission
router.post('/admin/:id/confirm', protect, confirmCommission);

// Mark as paid
router.post('/admin/:id/pay', protect, markCommissionAsPaid);

// Get all commissions
router.get('/admin/all', protect, adminGetAllCommissions);

// Get commission by ID
router.get('/admin/:id', protect, getCommissionById);

module.exports = router; 