import express from 'express';
import { createLead, getMyLeads, getLeadById, updateLeadStatus, adminGetAllLeads, getPartnerLeads } from '../controllers/lead.controller.js';
import { protect, protectPartner ,protectMulti  ,protectVaultAgent } from '../../../middleware/auth.js';

const router = express.Router();

// Agent routessds
router.post('/create', protectVaultAgent, createLead);
router.get('/my-leads', protectVaultAgent, getMyLeads);
router.get('/:id', protectVaultAgent, getLeadById);

router.get('/admin/all', protect, adminGetAllLeads);

router.get('/admin/:id', protect, getLeadById);

// Admin routes
router.put('/admin/:id/status',protect, updateLeadStatus);

// Partner routes
router.get('/partner', protectPartner, getPartnerLeads);

module.exports = router;