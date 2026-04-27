// proposal.routes.js
import express from 'express';
import { 
  createProposal, 
  sendProposal, 
  acceptProposal, 
  rejectProposal, 
  getMyProposals, 
  getProposalById,
  updateProposal,
  deleteProposal,
  getProposalBySecureLink,
  calculateBankOffer,
  getEligibleBanksForLead
} from '../controllers/proposal.controller.js';
import { protect, protectMulti } from '../../../middleware/auth.js';

const router = express.Router();

// ==================== PROPOSAL CRUD (Authenticated Users) ====================
router.post('/', protectMulti, createProposal);
router.get('/my-proposals', protectMulti, getMyProposals);
router.get('/:id', protectMulti, getProposalById);
router.put('/:id', protectMulti, updateProposal);
router.delete('/:id', protectMulti, deleteProposal);

// ==================== SEND PROPOSAL ====================
router.post('/:id/send', protectMulti, sendProposal);

// ==================== PUBLIC CUSTOMER ROUTES (No Auth - Secure Link) ====================
router.get('/secure/:id', getProposalBySecureLink);
router.post('/:id/accept', acceptProposal);
router.post('/:id/reject', rejectProposal);

// ==================== ELIGIBILITY & CALCULATION (Advisor Preview) ====================
router.get('/eligible-banks/:leadId', protectMulti, getEligibleBanksForLead);
router.post('/calculate-offer', protectMulti, calculateBankOffer);

module.exports = router;