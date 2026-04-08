import express from 'express';
import { createCase, submitCaseToXoto, updateCaseStatus, getPartnerCases, getCaseById, addCaseNote, adminGetAllCases } from '../controllers/case.controller.js';
import { protect, protectAdmin, protectPartner } from '../../../middleware/auth.js';

const router = express.Router();

// Partner routes
router.post('/', protectPartner, createCase);
router.post('/:id/submit', protectPartner, submitCaseToXoto);
router.get('/partner/cases', protectPartner, getPartnerCases);
router.post('/:id/notes', protectPartner, addCaseNote);

// Common routes
router.get('/:id', protect, getCaseById);

// Admin routes
router.get('/admin/all', protectAdmin, adminGetAllCases);
router.put('/admin/:id/status', protectAdmin, updateCaseStatus);

export default router;