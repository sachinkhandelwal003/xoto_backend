import express from 'express';
import { 
  uploadDocument, 
  verifyDocument, 
  rejectDocument, 
  deleteDocument, 
  getCaseDocuments, 
  getLeadDocuments 
} from '../controllers/document.controller.js';
import { protect, protectPartner, protectVaultAgent, protectAdmin ,protectMulti } from '../../../middleware/auth.js';

const router = express.Router();

// Protect Admin or Partner or FreelanceAgent for document upload
// Note: Partner-Affiliated Agent is EXCLUDED from upload
const protectUpload = async (req, res, next) => {
  try {
    await protect(req, res, next);
  } catch (err) {
    try {
      await protectPartner(req, res, next);
    } catch (err2) {
      try {
        // Only allow FreelanceAgent, NOT PartnerAffiliatedAgent
        await protectVaultAgent(req, res, next);
        // Check if it's FreelanceAgent (PartnerAffiliatedAgent will be rejected in controller)
        if (req.user?.agentType === 'PartnerAffiliatedAgent') {
          return res.status(403).json({
            success: false,
            message: "Partner-Affiliated Agents cannot upload documents. Your role is only to create leads."
          });
        }
      } catch (err3) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized. Admin, Partner, or Freelance Agent access required.',
        });
      }
    }
  }
};

// ==================== UPLOAD ROUTES ====================
router.post('/:leadId', protectMulti, uploadDocument);

router.post('/cases/:caseId', protectMulti, uploadDocument);

// ==================== GET DOCUMENTS ====================
router.get('/:leadId', protectMulti, getLeadDocuments);
router.get('/cases/:caseId', protectMulti, getCaseDocuments);

// ==================== DELETE DOCUMENT ====================
router.delete('/:id', protectMulti, deleteDocument);

// ==================== ADMIN ONLY ROUTES ====================
router.post('/:id/verify', protect, verifyDocument);
router.post('/:id/reject', protect, rejectDocument);

module.exports = router; 