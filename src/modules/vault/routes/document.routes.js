import express from 'express';
import { 
  uploadDocument, 
  verifyDocument, 
  rejectDocument, 
  deleteDocument, 
  getCaseDocuments, 
  getLeadDocuments 
} from '../controllers/document.controller.js';
import { protect, protectAdmin, protectPartner ,protectVaultAgent} from '../../../middleware/auth.js';

const router = express.Router();

// Partner routes
router.post('/cases/:caseId', protectPartner, uploadDocument);
router.get('/cases/:caseId', protectPartner, getCaseDocuments);

// Agent routes
router.post('/leads/:leadId', protectVaultAgent, uploadDocument);
router.get('/leads/:leadId', protectVaultAgent, getLeadDocuments);

// Common routes
router.delete('/:id', deleteDocument);

// Admin routes
router.post('/admin/:id/verify', protect, verifyDocument);
router.post('/admin/:id/reject', protect, rejectDocument);

module.exports = router;