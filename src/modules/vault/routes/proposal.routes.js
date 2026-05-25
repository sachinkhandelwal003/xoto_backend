import express from 'express';
import {
  getEligibleBanksForLead,
  createProposal,
  sendProposalPDF,
  recordCustomerPreference,
  rejectProposal,
  getMyProposals,
  getProposalById,
  getProposalsByLead,
  updateProposal,
  deleteProposal,
} from '../controllers/proposal.controller.js';
import { protect, protectMulti } from '../../../middleware/auth.js';

const router = express.Router();

// ── Static routes BEFORE /:id wildcards ──────────────────────────

// Advisor previews eligible banks before creating proposal
router.get('/eligible-banks/:leadId',  protectMulti, getEligibleBanksForLead);

// Get all proposals for logged-in user (advisor/partner/admin)
router.get('/',                         protectMulti, getMyProposals);

// Get proposals linked to a specific lead
router.get('/by-lead/:leadId',          protectMulti, getProposalsByLead);

// ── CRUD ─────────────────────────────────────────────────────────

// Create proposal from qualified lead
// Advisor OR Partner can create
router.post('/',                        protectMulti, createProposal);

// Get single proposal
router.get('/:id',                      protectMulti, getProposalById);

// Update proposal (Draft only)
router.put('/:id',                      protectMulti, updateProposal);

// Soft delete proposal
router.delete('/:id',                   protectMulti, deleteProposal);

// ── Workflow ──────────────────────────────────────────────────────

// Generate PDF + send to customer email
router.post('/:id/send',                protectMulti, sendProposalPDF);

// Advisor records which bank customer prefers (after customer reviews PDF)
router.put('/:id/preference',           protectMulti, recordCustomerPreference);

// Advisor marks proposal as rejected (customer not proceeding)
router.put('/:id/reject',               protectMulti, rejectProposal);

module.exports = router;