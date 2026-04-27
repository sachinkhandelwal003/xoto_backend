import express from 'express';
import { 
  uploadDocument, 
  verifyDocument, 
  rejectDocument, 
  deleteDocument, 
  getCaseDocuments, 
  getLeadDocuments,
  advisorVerifyDocument
} from '../controllers/document.controller.js';
import { protect, protectMulti, protectVaultAdvisor } from '../../../middleware/auth.js';

const router = express.Router();

// ==================== UPLOAD ROUTES ====================
// Upload to Lead (Admin, Partner, Freelance Agent, Xoto Advisor)
router.post('/:leadId', protectMulti, uploadDocument);

// Upload to Case (Admin, Partner, Xoto Advisor)
router.post('/cases/:caseId', protectMulti, uploadDocument);

// ==================== ADVISOR VERIFY ROUTES ====================
router.put('/advisor/verify/:documentId', protectVaultAdvisor, advisorVerifyDocument);

// ==================== GET DOCUMENTS ====================
router.get('/:leadId', protectMulti, getLeadDocuments);
router.get('/cases/:caseId', protectMulti, getCaseDocuments);

// ==================== DELETE DOCUMENT ====================
router.delete('/:id', protectMulti, deleteDocument);

// ==================== ADMIN ONLY VERIFY ROUTES ====================
router.post('/:id/verify', protect, verifyDocument);
router.post('/:id/reject', protect, rejectDocument);

module.exports = router; 