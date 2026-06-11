// routes/document.routes.js
import express from 'express';
import {
  uploadCaseDocument,
  getCaseDocuments,
  toggleDocumentHandler,
  toggleSkipBankForms,
  verifyDocument,
  rejectDocument,
  deleteDocument
} from '../controllers/document.controller.js';
import { protect, protectMulti, protectVaultAdvisor } from '../../../middleware/auth.js';

const router = express.Router();

// ==================== CASE DOCUMENT ROUTES ====================

// Upload document to case
router.post('/:caseId', protectMulti, uploadCaseDocument);

// Get case documents (from CaseDocumentRequirement)
router.get('/:caseId', protectMulti, getCaseDocuments);

// Toggle single document handler (Advisor ↔ Ops)
router.post('/:caseId/toggle-handler', protectMulti, toggleDocumentHandler);

// Bulk toggle — skip ALL bank forms to Ops (or pull back to Advisor)
router.post('/:caseId/toggle-skip-bank-forms', protectMulti, toggleSkipBankForms);

// ==================== VERIFICATION ROUTES ====================

// Admin/Ops verify document
router.post('/:id/verify', protectMulti, verifyDocument);

// Admin/Ops reject document
router.post('/:id/reject', protectMulti, rejectDocument);

// ==================== DELETE ====================

router.delete('/:id', protectMulti, deleteDocument);

module.exports = router; 