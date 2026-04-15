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
  getCaseStats
} from '../controllers/case.controller.js';
import { protect, protectAdmin, protectPartner,protectMulti} from '../../../middleware/auth.js';

const router = express.Router();

// ==================== PROTECTED ROUTES ====================

// ==================== CASE CRUD ====================
router.post('/',protectMulti, createCase);                          // Create case
router.get('/', protectMulti, getAllCases);                          // Get all cases
router.get('/stats', protect, getCaseStats);      // Get case statistics
router.get('/by-lead/:leadId', getCasesByLead);        // Get cases by lead
router.get('/by-proposal/:proposalId', getCasesByProposal); // Get cases by proposal
router.get('/:id', getCaseById);                       // Get case by ID
router.put('/:id', updateCase);                        // Update case
router.delete('/:id', protect, deleteCase);       // Delete case (Admin only)

// ==================== CASE WORKFLOW ====================
router.post('/:id/submit', protectMulti, submitCaseToXoto);          // Submit case to Xoto
router.put('/admin/:id/status', protect, updateCaseStatus); // Update status (Admin only)
router.post('/:id/notes', addCaseNote);                // Add case note

// ==================== CASE DOCUMENTS ====================
router.get('/:id/documents/status', getCaseDocumentStatus); // Get document status

module.exports = router;