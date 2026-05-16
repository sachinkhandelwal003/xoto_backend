import express from 'express';
import {
  createLead,
  createWebsiteLead,
  createPartnerLead,
  getMyLeads,
  getLeadById,
  getPartnerLeads,
  adminGetAllLeads,
  getUnassignedLeads,
  assignLeadToXotoAdvisor,
  updateLeadStatus,
  getAdvisorAssignedLeads,
  advisorUpdateLeadStatus,
  advisorUpdateLeadInfo,
  calculateLeadEligibility,
  getLeadEligibility,
  getLeadEligibilityHistory,bulkUploadLeads,bulkConfirmLeads,downloadLeadTemplate 
} from '../controllers/lead.controller.js';
// Add this import at top
import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage() });
import {
  protect,
  protectPartner,
  protectMulti,
  protectVaultAgent,
  protectVaultAdvisor,
} from '../../../middleware/auth.js';

const router = express.Router();

// ══════════════════════════════════════════════════════════════════
// PUBLIC — No auth
// ══════════════════════════════════════════════════════════════════
router.post('/website', createWebsiteLead);

// ══════════════════════════════════════════════════════════════════
// AGENT — FreelanceAgent + PartnerAffiliatedAgent
// (FreelanceAgent = Referral Partner per PRD)
// ══════════════════════════════════════════════════════════════════
router.post('/create',  protectVaultAgent, createLead);
router.get('/my-leads', protectVaultAgent, getMyLeads);

// ══════════════════════════════════════════════════════════════════
// PARTNER
// ══════════════════════════════════════════════════════════════════
router.post('/partner/create', protectPartner, createPartnerLead);
router.get('/partner/get',     protectPartner, getPartnerLeads);

// ══════════════════════════════════════════════════════════════════
// ADMIN
// ══════════════════════════════════════════════════════════════════
router.get('/admin/all',                 protect, adminGetAllLeads);
router.get('/admin/unassigned',          protect, getUnassignedLeads);
router.post('/admin/assign-to-advisor',  protect, assignLeadToXotoAdvisor);
router.put('/admin/:id/status',          protectMulti, updateLeadStatus);

// ══════════════════════════════════════════════════════════════════
// XOTO ADVISOR
// ══════════════════════════════════════════════════════════════════
router.get('/advisor/my-leads',                   protectVaultAdvisor, getAdvisorAssignedLeads);
router.put('/advisor/lead/:leadId/status',         protectVaultAdvisor, advisorUpdateLeadStatus);
router.put('/advisor/lead/:leadId/info',           protectVaultAdvisor, advisorUpdateLeadInfo);

// ══════════════════════════════════════════════════════════════════
// ELIGIBILITY — Advisor only
// ══════════════════════════════════════════════════════════════════
router.post('/:leadId/calculate-eligibility', protectVaultAdvisor, calculateLeadEligibility);
router.get('/:leadId/eligibility',            protectVaultAdvisor, getLeadEligibility);
router.get('/:leadId/eligibility/history',    protectVaultAdvisor, getLeadEligibilityHistory);





// Add these 3 routes in ADMIN section
// router.post('/admin/bulk-upload',   protect, upload.single('file'), bulkUploadLeads);
// router.post('/admin/bulk-confirm',  protect, bulkConfirmLeads);
// router.get('/admin/bulk-template',  protect, downloadLeadTemplate);
// ══════════════════════════════════════════════════════════════════
// SHARED — Any authenticated user
// ══════════════════════════════════════════════════════════════════
router.get('/:id', getLeadById);

module.exports = router;