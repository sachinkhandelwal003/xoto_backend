import express from 'express';
import { createProposal, sendProposal, acceptProposal, rejectProposal, getPartnerProposals, getProposalById } from '../controllers/proposal.controller.js';
import { protect, protectPartner } from '../../../middleware/auth.js';

const router = express.Router();

// Partner routes
router.post('/', protectPartner, createProposal);
router.post('/:id/send', protectPartner, sendProposal);
router.get('/partner/proposals', protectPartner, getPartnerProposals);

// Public routes (client via secure link)
router.post('/:id/accept', acceptProposal);
router.post('/:id/reject', rejectProposal);

// Common routes
router.get('/:id', protect, getProposalById);

export default router;