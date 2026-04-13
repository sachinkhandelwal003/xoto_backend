import express from 'express';
import { 
  createProposal, 
  sendProposal, 
  acceptProposal, 
  rejectProposal, 
  getMyProposals, 
  getProposalById,
  updateProposal,
  deleteProposal
} from '../controllers/proposal.controller.js';
import { protect, protectPartner, protectVaultAgent,protectMulti } from '../../../middleware/auth.js';

const router = express.Router();

// Protect any authenticated user


// ==================== PROPOSAL CRUD ====================
router.post('/', protectMulti, createProposal);
router.get('/my-proposals', protectMulti, getMyProposals);
router.get('/:id', protectMulti, getProposalById);
router.put('/:id', protectMulti, updateProposal);
router.delete('/:id', protectMulti, deleteProposal);

// ==================== SEND PROPOSAL ====================
router.post('/:id/send', protectMulti, sendProposal);

// ==================== PUBLIC ROUTES (Client via link) ====================
router.post('/:id/accept', acceptProposal);
router.post('/:id/reject', rejectProposal);

module.exports = router;