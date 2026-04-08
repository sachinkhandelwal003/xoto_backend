import express from 'express';
import { createCommission, confirmCommission, markCommissionAsPaid, getMyCommissions, getPartnerCommissions, adminGetAllCommissions } from '../controllers/commission.controller.js';
import { protect, protectAdmin, protectPartner } from '../../../middleware/auth.js';

const router = express.Router();

// Agent/Partner routes
router.get('/my', protect, getMyCommissions);

// Partner routes
router.get('/partner', protectPartner, getPartnerCommissions);

// Admin routes
router.post('/admin/create', protectAdmin, createCommission);
router.post('/admin/:id/confirm', protectAdmin, confirmCommission);
router.post('/admin/:id/pay', protectAdmin, markCommissionAsPaid);
router.get('/admin/all', protectAdmin, adminGetAllCommissions);

export default router;