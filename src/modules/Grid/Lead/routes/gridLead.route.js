// ════════════════════════════════════════════════════════════════════════════
// gridLead.routes.js  — UPDATED (advisor note route added)
// ════════════════════════════════════════════════════════════════════════════

const express    = require('express');
const router     = express.Router();
const controller = require('../controller/gridLead.controller');
const referral   = require('../controller/gridLead.referralPartner.controller');
const { protectMulti } = require('../../../../middleware/auth');


// ════════════════════════════════════════════════════════════════════════════
// PUBLIC — No auth required
// ════════════════════════════════════════════════════════════════════════════

router.post('/website-lead',        controller.createWebsiteLead);
router.post('/website-lead/simple', controller.createSimpleWebsiteLead);


// ════════════════════════════════════════════════════════════════════════════
// All routes below require authentication
// ════════════════════════════════════════════════════════════════════════════

router.use(protectMulti);


// ────────────────────────────────────────────────────────────────────────────
// ADVISOR ROUTES
// ────────────────────────────────────────────────────────────────────────────

router.get('/my-leads',    controller.getMyAssignedLeads);   // advisor ke assigned leads
router.put('/:id/status',  controller.updateMyLeadStatus);   // status update (flow-enforced)

// Advisor manually suggest karta hai aur client react karta hai
router.post('/:id/suggest-property',    controller.suggestPropertyToClient);
router.put ('/:id/suggestion-reaction', controller.updateSuggestionReaction);
router.put ('/:id/update-requirements', controller.updateLeadRequirements);
router.get ('/:id/smart-matches',       controller.getSmartMatches);

// ── NEW: Advisor private note ─────────────────────────────────────────────
router.post('/:id/note-advisor',        controller.addAdvisorNote);   // ← ADDED


// ────────────────────────────────────────────────────────────────────────────
// ADMIN ROUTES
// ────────────────────────────────────────────────────────────────────────────

router.get('/',                      controller.getLeads);                // all leads (with filters)
router.get('/website-only',          controller.getWebsitePlatformLeads); // website platform leads
router.get('/agent-only',            controller.getAgentLeads);           // all agent leads (admin view)
router.get('/submitted-queue',       controller.getSubmittedQueue);       // unassigned submitted leads
router.get('/:id/suggest-advisors',  controller.suggestAdvisorsForLead);  // advisor suggestions
router.put('/:id/assign',            controller.assignAdvisorToLead);     // assign advisor

// Commission management (referral leads)
router.put('/:id/commission', referral.updateCommissionStatus);


// ────────────────────────────────────────────────────────────────────────────
// AGENT ROUTES  (prefix: /agent)
// ────────────────────────────────────────────────────────────────────────────

router.post('/agent/create-lead',              controller.createLead);
router.get ('/agent/my-leads',                 controller.getAgentOwnLeads);
router.get ('/agent/stats',                    controller.getAgentStats);
router.post('/agent/:id/save-matches',         controller.saveMatchedListings);
router.post('/agent/:id/submit-to-xoto',       controller.submitLeadToXoto);
router.post('/agent/:id/update-requirements',  controller.agentUpdateRequirements);
router.post('/agent/:id/note',                 controller.addAgentNote);


// ────────────────────────────────────────────────────────────────────────────
// REFERRAL PARTNER ROUTES  (prefix: /referral)
// ────────────────────────────────────────────────────────────────────────────

router.post('/referral/create-lead',              referral.createReferralLead);
router.get ('/referral/my-leads',                 referral.getReferralPartnerLeads);
router.get ('/referral/stats',                    referral.getReferralPartnerStats);
router.post('/referral/:id/save-matches',         referral.saveReferralMatchedListings);
router.post('/referral/:id/submit-to-xoto',       referral.submitReferralLeadToXoto);
router.put ('/referral/:id/update-requirements',  referral.updateReferralRequirements);
router.post('/referral/:id/note',                 referral.addReferralNote);


// ────────────────────────────────────────────────────────────────────────────
// GENERIC — Lead detail (role-based sanitization controller mein)
// NOTE: Ye hamesha SABSE NEECHE hona chahiye — /:id sab kuch match karta hai
// ────────────────────────────────────────────────────────────────────────────

router.get('/:id', controller.getLeadById);


module.exports = router;