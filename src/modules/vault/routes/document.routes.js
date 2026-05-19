// routes/document.routes.js
import express from 'express';
import {
  uploadCaseDocument,
  getCaseDocuments,
  toggleDocumentHandler,
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

// Toggle document handler (Advisor can take bank forms)
router.post('/:caseId/toggle-handler', protectVaultAdvisor, toggleDocumentHandler);

// ==================== VERIFICATION ROUTES ====================

// Admin/Ops verify document
router.post('/:id/verify', protectMulti, verifyDocument);

// Admin/Ops reject document
router.post('/:id/reject', protectMulti, rejectDocument);

// ==================== DELETE ====================

router.delete('/:id', protectMulti, deleteDocument);

module.exports = router; 