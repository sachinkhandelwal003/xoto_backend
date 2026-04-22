import express from 'express';
import { 
  createLead, 
  getMyLeads, 
  getLeadById, 
  updateLeadStatus, 
  adminGetAllLeads, 
  getPartnerLeads,
  createWebsiteLead,
  createPartnerLead,
  getUnassignedLeads,
  assignLeadToXotoAdvisor
} from '../controllers/lead.controller.js';
import { protect, protectPartner, protectMulti, protectVaultAgent } from '../../../middleware/auth.js';

const router = express.Router();

// ==================== PUBLIC ROUTES ====================
router.post('/website', createWebsiteLead);  // Website lead capture

// ==================== AGENT ROUTES ====================
router.post('/create', protectVaultAgent, createLead);
router.get('/my-leads', protectVaultAgent, getMyLeads);
router.get('/:id', getLeadById);

// ==================== PARTNER ROUTES ====================
router.post('/partner/create', protectPartner, createPartnerLead);  // Individual partner creates lead
router.get('/partner/leads', protectPartner, getPartnerLeads);

// ==================== ADMIN ROUTES ====================
router.get('/admin/all', protect, adminGetAllLeads);
router.get('/admin/unassigned', protect, getUnassignedLeads);
router.post('/admin/assign-to-advisor', protect, assignLeadToXotoAdvisor);
router.put('/admin/:id/status', protect, updateLeadStatus);

module.exports = router;