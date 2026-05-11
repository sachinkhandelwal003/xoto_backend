// const express = require('express');
// const router = express.Router();
// const presCtrl = require('../controllers/presentationController');


// // Controllers
// const agentCtrl = require('../controllers/index');          // signup, login, profile
// // const leadCtrl = require('../controllers/LeadController');           // leads
// // const siteVisitCtrl = require('../controllers/SiteVisitController'); // site visits

// // Middleware (already supports agents via decoded.role === 'agent')
// const { protectMulti } = require('../../../../middleware/auth');

// // ─────────────────────────────────────────────────────────────
// //  PUBLIC ROUTES (no authentication required)
// // ─────────────────────────────────────────────────────────────
// router.post('/agent-signup', agentCtrl.agentSignup);
// router.post('/login-agent',  agentCtrl.agentLogin);

// // ─────────────────────────────────────────────────────────────
// //  PROTECTED ROUTES (require valid agent token)
// // ─────────────────────────────────────────────────────────────
// router.use(protectMulti);


// // Presentation routes
// router.post('/presentations',            presCtrl.createPresentationDraft);
// router.patch('/presentations/:id',       presCtrl.updatePresentation);
// router.post('/presentations/:id/generate', presCtrl.generatePresentation);
// router.get('/presentations',             presCtrl.listPresentations);
// router.get('/presentations/:id',         presCtrl.getPresentation);
// // Agent Profile
// // router.get('/me', agentCtrl.getAgentProfile);
// // router.put('/me', agentCtrl.updateAgentProfile);

// // Lead Management
// // router.post('/lead/create-lead',                leadCtrl.createLead);
// // router.get('/lead/get-all-leads',               leadCtrl.getAllLeads);
// // router.get('/lead/get-lead/:id',                leadCtrl.getLeadById);
// // router.put('/lead/update-lead/:id',             leadCtrl.updateLead);
// // router.put('/lead/update-status/:id',           leadCtrl.updateLeadStatus);
// // router.post('/lead/add-interest',               leadCtrl.addLeadInterest);
// // router.put('/lead/select-property',             leadCtrl.selectProperty);
// // router.delete('/lead/remove-interest/:interestId', leadCtrl.removeLeadInterest);
// // router.delete('/lead/delete-lead/:id',          leadCtrl.deleteLead);
// // router.get('/lead/fetch-properties',            leadCtrl.fetchPropertySuggestions);

// // Site Visits
// // router.post('/site-visit/create-site-visit',    siteVisitCtrl.createSiteVisit);
// // router.get('/site-visit/get-all-site-visits',   siteVisitCtrl.getAllSiteVisits);
// // router.get('/site-visit/:id',                   siteVisitCtrl.getSiteVisitById);
// // router.post('/site-visit/approve-site-visit/:id', siteVisitCtrl.approveSiteVisit);
// // router.post('/site-visit/update-site-visit/:id', siteVisitCtrl.updateSiteVisitStatus);
// // router.post('/site-visit/reschedule-site-visit/:id', siteVisitCtrl.rescheduleSiteVisit);
// // router.get('/site-visit/by-lead/:leadId',       siteVisitCtrl.getSiteVisitsByLead);
// // router.get('/site-visit/by-agent/:agentId',     siteVisitCtrl.getSiteVisitsByAgent);
// // router.get('/site-visit/check-reminders',       siteVisitCtrl.checkReminders);

// module.exports = router;


const express  = require("express");
const router   = express.Router();
const presCtrl = require("../controllers/PresentationController");
const agentCtrl = require("../controllers/index");
const { protectMulti } = require("../../../../middleware/auth");

// ── PUBLIC ───────────────────────────────────────────────────
router.post("/agent-signup", agentCtrl.agentSignup);
router.post("/login-agent",  agentCtrl.agentLogin);

// Public share view — no auth needed (PRD 10.1)
router.get("/presentations/share/:token", presCtrl.sharePresentation);

// ── PROTECTED ────────────────────────────────────────────────
router.use(protectMulti);

// Presentations (PRD Section 10)
router.post("/presentations",                presCtrl.createPresentationDraft); // create draft
router.put("/presentations/:id",           presCtrl.updatePresentation);      // edit draft
router.post("/presentations/:id/generate",   presCtrl.generatePresentation);    // generate PDF + share link
router.post("/presentations/:id/share",      presCtrl.shareViaChannel);         // mark shared via whatsapp/email
router.get("/presentations",                 presCtrl.listPresentations);        // list all
router.get("/presentations/:id",             presCtrl.getPresentation);          // get single
router.delete("/presentations/:id",          presCtrl.archivePresentation);      // archive

module.exports = router;