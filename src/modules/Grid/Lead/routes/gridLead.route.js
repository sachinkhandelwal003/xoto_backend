const express = require('express');
const router = express.Router();
const controller = require('../controller/gridLead.controller');
const { protectMulti } = require('../../../../middleware/auth');

// ==============================================================
// PUBLIC ROUTES (No authentication required)
// ==============================================================

// Website lead creation
router.post('/website-lead', controller.createWebsiteLead);
router.post('/website-lead/simple', controller.createSimpleWebsiteLead);



router.use(protectMulti);
router.get('/my-leads', controller.getMyAssignedLeads);
router.put('/:id/status', controller.updateMyLeadStatus);
router.get('/', controller.getLeads);
router.get('/website-only', controller.getWebsitePlatformLeads);
router.get('/agent-only', controller.getAgentLeads);
router.post('/create-lead', controller.createLead);
router.get('/:id/suggest-advisors', controller.suggestAdvisorsForLead);
router.put('/:id/assign',           controller.assignAdvisorToLead);

// ==============================================================
// PROTECTED ROUTES (Will add in next steps)
// ==============================================================
// Admin routes
// Agent routes  
// Advisor routes

module.exports = router;