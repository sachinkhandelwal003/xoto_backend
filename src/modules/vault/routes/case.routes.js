import express from 'express';
import { 
  createCase, 
  getAllCases, 
  getCaseById, 
  updateCase, 
  submitCaseToXoto, 
  updateCaseStatus, 
  addCaseNote,
  getCasesByLead,
  getCasesByProposal,
  getCaseDocumentStatus,
  deleteCase,
  getCaseStats, getOpsQueue,
  opsPickUpCase,
  adminAssignCaseToOps,
  getMyAssignedCases,
  returnCaseForCorrection,
  submitCaseToBank,
  updateBankDecision,resubmitCaseAfterCorrection,getCaseAmountDetails
} from '../controllers/case.controller.js';
import { protect, protectMulti,protectVaultOps,protectVaultAdvisor } from '../../../middleware/auth.js';

const router = express.Router();

// ==================== CASE CRUD ====================
router.post('/', protectMulti, createCase);
router.get('/', protectMulti, getAllCases);
router.get('/stats', protect, getCaseStats);
router.get('/by-lead/:leadId', protectMulti, getCasesByLead);
router.get('/by-proposal/:proposalId', protectMulti, getCasesByProposal);
router.get('/:id', protectMulti, getCaseById);
router.put('/:id', protectMulti, updateCase);
router.delete('/:id', protect, deleteCase);

// ==================== CASE WORKFLOW ====================
router.post('/:id/submit', protectMulti, submitCaseToXoto);
router.put('/:id/status', protectMulti, updateCaseStatus);
router.post('/:id/notes', protectMulti, addCaseNote);

// ==================== OPS QUEUE ROUTES ====================
router.get('/ops/queue', protectMulti, getOpsQueue);
router.post('/ops/pickup/:caseId', protectVaultOps, opsPickUpCase);
router.post('/ops/assign', protect, adminAssignCaseToOps);
router.get('/ops/my-cases', protectVaultOps, getMyAssignedCases);
router.post('/ops/return/:caseId', protectMulti, returnCaseForCorrection);
router.post('/ops/submit-to-bank/:caseId', protectMulti, submitCaseToBank);
router.put('/ops/resubmit/:id', protectMulti, resubmitCaseAfterCorrection);
router.put('/ops/bank-decision/:caseId', protectMulti, updateBankDecision);
router.get('/ops/bank-decision/:caseId/amount-details', protectMulti, getCaseAmountDetails);

// ==================== CASE DOCUMENTS ====================
router.get('/:id/documents/status', protectMulti, getCaseDocumentStatus);

module.exports = router;  