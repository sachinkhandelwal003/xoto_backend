const express = require('express');
const router = express.Router();

// Controllers
const agentCtrl = require('../controllers/index');          // signup, login, profile
// const leadCtrl = require('../controllers/LeadController');           // leads
// const siteVisitCtrl = require('../controllers/SiteVisitController'); // site visits

// Middleware (already supports agents via decoded.role === 'agent')
const { protectMulti } = require('../../../../middleware/auth');

// ─────────────────────────────────────────────────────────────
//  PUBLIC ROUTES (no authentication required)
// ─────────────────────────────────────────────────────────────
router.post('/agent-signup', agentCtrl.agentSignup);
router.post('/login-agent',  agentCtrl.agentLogin);

// ─────────────────────────────────────────────────────────────
//  PROTECTED ROUTES (require valid agent token)
// ─────────────────────────────────────────────────────────────
router.use(protectMulti);

// Agent Profile
// router.get('/me', agentCtrl.getAgentProfile);
// router.put('/me', agentCtrl.updateAgentProfile);

// Lead Management
// router.post('/lead/create-lead',                leadCtrl.createLead);
// router.get('/lead/get-all-leads',               leadCtrl.getAllLeads);
// router.get('/lead/get-lead/:id',                leadCtrl.getLeadById);
// router.put('/lead/update-lead/:id',             leadCtrl.updateLead);
// router.put('/lead/update-status/:id',           leadCtrl.updateLeadStatus);
// router.post('/lead/add-interest',               leadCtrl.addLeadInterest);
// router.put('/lead/select-property',             leadCtrl.selectProperty);
// router.delete('/lead/remove-interest/:interestId', leadCtrl.removeLeadInterest);
// router.delete('/lead/delete-lead/:id',          leadCtrl.deleteLead);
// router.get('/lead/fetch-properties',            leadCtrl.fetchPropertySuggestions);

// Site Visits
// router.post('/site-visit/create-site-visit',    siteVisitCtrl.createSiteVisit);
// router.get('/site-visit/get-all-site-visits',   siteVisitCtrl.getAllSiteVisits);
// router.get('/site-visit/:id',                   siteVisitCtrl.getSiteVisitById);
// router.post('/site-visit/approve-site-visit/:id', siteVisitCtrl.approveSiteVisit);
// router.post('/site-visit/update-site-visit/:id', siteVisitCtrl.updateSiteVisitStatus);
// router.post('/site-visit/reschedule-site-visit/:id', siteVisitCtrl.rescheduleSiteVisit);
// router.get('/site-visit/by-lead/:leadId',       siteVisitCtrl.getSiteVisitsByLead);
// router.get('/site-visit/by-agent/:agentId',     siteVisitCtrl.getSiteVisitsByAgent);
// router.get('/site-visit/check-reminders',       siteVisitCtrl.checkReminders);

module.exports = router;