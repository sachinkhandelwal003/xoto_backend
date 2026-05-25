// routes/dealRecord.routes.js
// PRD §8.5, §12.3, §12.5, §3.2, §7.1, §11.3

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/Dealrecord.controller');
const { protectMulti, authorize } = require('../../../../middleware/auth');

// ── Shorthand middleware aliases ──────────────────────────────────────────────
const adminOnly      = authorize({ roles: ['admin', 'superadmin'] });
const superAdminOnly = authorize({ roles: ['superadmin'] });
const advisorOnly    = authorize({ roles: ['gridadvisor'] });
const agentOnly      = authorize({ roles: ['agent'] });
const agencyOnly     = authorize({ roles: ['agency'] });
const referralOnly   = authorize({ roles: ['gridreferralpartner'] });
const adminOrAdvisor = authorize({ roles: ['admin', 'superadmin', 'gridadvisor', 'agent'] });

// ════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES — Full ledger, stats, export
// ════════════════════════════════════════════════════════════════════════════

// POST   /deal-records                  Create a new deal record (PRD §8.5)
router.post('/', protectMulti, adminOnly, ctrl.createDealRecord);

// GET    /deal-records                  Full ledger with filters (PRD §12.5)
router.get('/', protectMulti, adminOnly, ctrl.getAllDealRecords);

// GET    /deal-records/stats            Commission stats overview (PRD §12.7)
router.get('/stats', protectMulti, adminOnly, ctrl.getCommissionStats);

// GET    /deal-records/export           Commission ledger CSV export (PRD §12.5)
// NOTE: must stay above /:id routes — Express would match 'export' as an id otherwise
router.get('/export', protectMulti, adminOnly, ctrl.exportDealRecords);

// ════════════════════════════════════════════════════════════════════════════
// PERSONA-SCOPED LIST ROUTES
// All must come before /:id to avoid route conflicts
// ════════════════════════════════════════════════════════════════════════════

// GET    /deal-records/my-deals         Advisor's own deals (PRD §7.1)
router.get('/my-deals', protectMulti, advisorOnly, ctrl.getMyDeals);

// GET    /deal-records/my-agent-deals   Agent's own deals (PRD §8.2)
router.get('/my-agent-deals', protectMulti, agentOnly, ctrl.getMyAgentDeals);

// GET    /deal-records/agency-deals     Agency sees all affiliated agent deals (PRD §11.3)
router.get('/agency-deals', protectMulti, agencyOnly, ctrl.getAgencyDeals);

// GET    /deal-records/referral-deals   Referral partner sees own deals (PRD §3.2)
router.get('/referral-deals', protectMulti, referralOnly, ctrl.getReferralDeals);

// ════════════════════════════════════════════════════════════════════════════
// SINGLE RECORD — Admin + owning advisor/agent (PRD §10.4 ownership check)
// ════════════════════════════════════════════════════════════════════════════

// GET    /deal-records/:id
router.get('/:id', protectMulti, adminOrAdvisor, ctrl.getDealRecordById);

// ════════════════════════════════════════════════════════════════════════════
// DEAL LIFECYCLE ACTIONS — Admin only
// PRD §8.5 flow: pending → evidence → confirmed → paid
// Record is immutable (isLocked) after confirm
// ════════════════════════════════════════════════════════════════════════════

// PATCH  /deal-records/:id              Edit before confirmation (PRD §12.3)
router.patch('/:id', protectMulti, adminOnly, ctrl.updateDealRecord);

// PATCH  /deal-records/:id/evidence     Upload SPA / booking form (PRD §8.5)
router.patch('/:id/evidence', protectMulti, adminOnly, ctrl.uploadEvidence);

// PATCH  /deal-records/:id/confirm      Confirm and lock (PRD §8.5)
router.patch('/:id/confirm', protectMulti, adminOnly, ctrl.confirmDeal);

// PATCH  /deal-records/:id/pay          Mark main commission as paid (PRD §12.5)
router.patch('/:id/pay', protectMulti, adminOnly, ctrl.markAsPaid);

// PATCH  /deal-records/:id/confirm-referral  Confirm referral commission (PRD §3.2)
// NOTE: must come before /:id/pay-referral — both match /:id/* pattern
// Fix #1: this was the missing step that blocked markReferralAsPaid from ever running
router.patch('/:id/confirm-referral', protectMulti, adminOnly, ctrl.confirmReferralCommission);

// PATCH  /deal-records/:id/pay-referral Mark referral commission as paid (PRD §3.2)
router.patch('/:id/pay-referral', protectMulti, adminOnly, ctrl.markReferralAsPaid);

// ════════════════════════════════════════════════════════════════════════════
// ADMIN MANAGEMENT ACTIONS — Flag, void, escalate (PRD §12.3)
// ════════════════════════════════════════════════════════════════════════════

// PATCH  /deal-records/:id/flag         Flag for review
router.patch('/:id/flag', protectMulti, adminOnly, ctrl.flagDeal);

// PATCH  /deal-records/:id/unflag       Remove flag
router.patch('/:id/unflag', protectMulti, adminOnly, ctrl.unflagDeal);

// PATCH  /deal-records/:id/void         Soft delete — super admin only (PRD §14.4)
// Fix #3: controller now blocks void if commissionStatus or referralCommissionStatus === 'paid'
router.patch('/:id/void', protectMulti, superAdminOnly, ctrl.voidDeal);

// PATCH  /deal-records/:id/escalate     Escalate to super admin
router.patch('/:id/escalate', protectMulti, adminOnly, ctrl.escalateDeal);

module.exports = router;