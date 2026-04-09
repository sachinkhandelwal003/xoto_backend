import express from 'express';
import { 
  uploadDocument, 
  verifyDocument, 
  rejectDocument, 
  deleteDocument, 
  getCaseDocuments, 
  getLeadDocuments 
} from '../controllers/document.controller.js';
import { protect, protectAdmin, protectPartner } from '../../../middleware/auth.js';

const router = express.Router();

// Partner routes
router.post('/cases/:caseId', protectPartner, uploadDocument);
router.get('/cases/:caseId', protectPartner, getCaseDocuments);

// Agent routes
router.post('/leads/:leadId', protect, uploadDocument);
router.get('/leads/:leadId', protect, getLeadDocuments);

// Common routes
router.delete('/:id', protect, deleteDocument);

// Admin routes
router.post('/admin/:id/verify', protectAdmin, verifyDocument);
router.post('/admin/:id/reject', protectAdmin, rejectDocument);

export default router;