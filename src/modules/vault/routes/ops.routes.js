// routes/mortgageOps.routes.js
import express from 'express';
import {
  createMortgageOps,
  getAllMortgageOps,
  getOpsWorkload,
  assignCaseToOps,
  opsLogin,
  getMyCases,
  getOpsQueue,
  pickUpCase,
  updateCaseStatus,
  getOpsDashboard,
  suspendOps,
  activateOps,
  deleteOps,
  getOpsProfile,
  changeOpsPassword,getMortgageOpsById
} from '../controllers/mortgageOps.controller.js';

import { protect } from '../../../middleware/auth.js';

const router = express.Router();

// ==================== ADMIN ONLY ====================
router.post('/create', protect, createMortgageOps);
router.get('/all', protect, getAllMortgageOps);
// Add this line with other admin routes
router.get('/get/:id', protect, getMortgageOpsById);
router.get('/workload', protect, getOpsWorkload);
router.post('/assign-case', protect, assignCaseToOps);
router.post('/suspend/:id', protect, suspendOps);
router.post('/activate/:id', protect, activateOps);
router.delete('/delete/:id', protect, deleteOps);

// ==================== PUBLIC ====================
router.post('/login', opsLogin);

// ==================== SELF (Ops Only) ====================
router.get('/me', protect, getOpsProfile);
router.get('/dashboard', protect, getOpsDashboard);
router.get('/my-cases', protect, getMyCases);
router.get('/queue', protect, getOpsQueue);
router.post('/pickup/:caseId', protect, pickUpCase);
router.put('/case/:caseId/status', protect, updateCaseStatus);
router.post('/change-password', protect, changeOpsPassword);

module.exports = router;  