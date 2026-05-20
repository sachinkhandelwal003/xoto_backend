// routes/dealRecord.routes.js
// PRD §8.5, §12.3, §12.5

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/Dealrecord.controller');
const { protectMulti, authorize } = require('../../../../middleware/auth');

// ── Shorthand middleware aliases ──────────────────────────────────────────────
const adminOnly        = authorize({ roles: ['admin', 'superadmin'] });
const superAdminOnly   = authorize({ roles: ['superadmin'] });
const advisorOnly      = authorize({ roles: ['gridadvisor'] });
const agencyOnly       = authorize({ roles: ['agency'] });
const referralOnly     = authorize({ roles: ['gridreferralpartner'] });
const adminOrAdvisor   = authorize({ roles: ['admin', 'superadmin', 'gridadvisor', 'agent'] });

// ════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES — Create, manage, and action deal records
// ════════════════════════════════════════════════════════════════════════════

// POST   /deal-records            Create a new deal record (PRD §8.5)
router.post('/', protectMulti, adminOnly, ctrl.createDealRecord);

// GET    /deal-records            Full ledger with filters (PRD §12.5)
router.get('/', protectMulti, adminOnly, ctrl.getAllDealRecords);

// GET    /deal-records/stats      Commission stats overview (PRD §12.7)
router.get('/stats', protectMulti, adminOnly, ctrl.getCommissionStats);

// ════════════════════════════════════════════════════════════════════════════
// PERSONA-SCOPED ROUTES (must come before /:id to avoid route conflicts)
// ════════════════════════════════════════════════════════════════════════════

// GET    /deal-records/my-deals            Advisor's own deals (PRD §7.1)
router.get('/my-deals', protectMulti, advisorOnly, ctrl.getMyDeals);

// GET    /deal-records/agency-deals        Agency sees all agent deals (PRD §11.3)
router.get('/agency-deals', protectMulti, agencyOnly, ctrl.getAgencyDeals);

// GET    /deal-records/referral-deals      Referral partner sees own deals (PRD §3.2)
router.get('/referral-deals', protectMulti, referralOnly, ctrl.getReferralDeals);

// ════════════════════════════════════════════════════════════════════════════
// SINGLE RECORD — Admin + owning advisor/agent (PRD §10.4 ownership check)
// ════════════════════════════════════════════════════════════════════════════

// GET    /deal-records/:id
router.get('/:id', protectMulti, adminOrAdvisor, ctrl.getDealRecordById);

// ════════════════════════════════════════════════════════════════════════════
// DEAL LIFECYCLE ACTIONS — Admin only
// PRD §8.5: pending → evidence upload → confirmed → paid (immutable after confirm)
// ════════════════════════════════════════════════════════════════════════════

// PATCH  /deal-records/:id              Edit before confirmation (PRD §12.3)
router.patch('/:id', protectMulti, adminOnly, ctrl.updateDealRecord);

// PATCH  /deal-records/:id/evidence     Upload SPA/booking form (PRD §8.5)
router.patch('/:id/evidence', protectMulti, adminOnly, ctrl.uploadEvidence);

// PATCH  /deal-records/:id/confirm      Confirm and lock (PRD §8.5)
router.patch('/:id/confirm', protectMulti, adminOnly, ctrl.confirmDeal);

// PATCH  /deal-records/:id/pay          Mark commission as paid (PRD §12.5)
router.patch('/:id/pay', protectMulti, adminOnly, ctrl.markAsPaid);

// PATCH  /deal-records/:id/pay-referral Mark referral commission as paid (PRD §3.2)
router.patch('/:id/pay-referral', protectMulti, adminOnly, ctrl.markReferralAsPaid);

// ════════════════════════════════════════════════════════════════════════════
// ADMIN MANAGEMENT ACTIONS — Flag, void, escalate (PRD §12.3)
// ════════════════════════════════════════════════════════════════════════════

// PATCH  /deal-records/:id/flag         Flag for review
router.patch('/:id/flag', protectMulti, adminOnly, ctrl.flagDeal);

// PATCH  /deal-records/:id/unflag       Remove flag
router.patch('/:id/unflag', protectMulti, adminOnly, ctrl.unflagDeal);

// PATCH  /deal-records/:id/void         Soft delete (Super Admin only, PRD §14.4)
router.patch('/:id/void', protectMulti, superAdminOnly, ctrl.voidDeal);

// PATCH  /deal-records/:id/escalate     Escalate to super admin
router.patch('/:id/escalate', protectMulti, adminOnly, ctrl.escalateDeal);

module.exports = router;
