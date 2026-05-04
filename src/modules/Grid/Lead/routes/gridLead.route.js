const express = require('express');
const router = express.Router();
const controller = require('../controller/gridLead.controller');

// ==============================================================
// PUBLIC ROUTES (No authentication required)
// ==============================================================

// Website lead creation
router.post('/website-lead', controller.createWebsiteLead);
router.post('/website-lead/simple', controller.createSimpleWebsiteLead);

router.get('/', controller.getLeads);

// ==============================================================
// PROTECTED ROUTES (Will add in next steps)
// ==============================================================
// Admin routes
// Agent routes  
// Advisor routes

module.exports = router;