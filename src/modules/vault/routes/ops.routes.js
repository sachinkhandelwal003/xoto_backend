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

import { protect, protectVaultOps } from '../../../middleware/auth.js';

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
router.get('/me', protectVaultOps, getOpsProfile);
router.get('/dashboard', protectVaultOps, getOpsDashboard);
router.get('/my-cases', protectVaultOps, getMyCases);
router.get('/queue', protectVaultOps, getOpsQueue);
router.post('/pickup/:caseId', protectVaultOps, pickUpCase);
router.put('/case/:caseId/status', protectVaultOps, updateCaseStatus);
router.post('/change-password', protectVaultOps, changeOpsPassword);

module.exports = router;  