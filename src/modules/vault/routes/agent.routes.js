const express = require('express');
const {
  // Auth
  agentSignup,
  agentLogin,
  requestPasswordReset,
  resetPassword,

  // Onboarding
  adminOnboardFreelanceAgent,
  partnerOnboardAffiliatedAgent,

  // Verification
  verifyAgent,
  verifyAgentDocument,
  setCommissionEligible,

  // Management
  suspendAgent,
  activateAgent,
  getAgentById,
  getAllAgents,
  getAgentsByPartner,

  // Profile
  getAgentProfile,
  updateAgentProfile,
  changePassword,

} = require('../controllers/agent.controller');
const { protect, protectPartner, protectVaultAgent, protectMulti } = require('../../../middleware/auth');

const router = express.Router();

// ==================== PUBLIC ROUTES ====================
router.post('/signup', agentSignup);
router.post('/login', agentLogin);
router.post('/reset-password', requestPasswordReset);
router.post('/reset-password/:token', resetPassword);

// ==================== ADMIN ONLY (Role code 18) ====================
router.post('/admin/onboard-freelance', protect, adminOnboardFreelanceAgent);
router.post('/admin/verify/:id', protect, verifyAgent);
router.get('/admin/all-agents', protect, getAllAgents);
router.patch('/admin/verify-document/:id',    protect, verifyAgentDocument);
router.patch('/admin/confirm-commission/:id',  protect, setCommissionEligible);

// ==================== PARTNER ONLY (Role code 21) ====================
router.post('/partner/onboard-affiliate', protectPartner, partnerOnboardAffiliatedAgent);
router.post('/partner/verify/:id', protectPartner, verifyAgent);
router.get('/partner/agents', protectPartner, getAgentsByPartner);
router.patch('/partner/verify-document/:id',   protectPartner, verifyAgentDocument);
router.patch('/partner/confirm-commission/:id', protectPartner, setCommissionEligible);

// ==================== COMMON (Admin, Partner, or Self) ====================
router.post('/suspend/:id', protectMulti, suspendAgent);
router.post('/activate/:id', protectMulti, activateAgent);
router.get('/get/:id', protectMulti, getAgentById);

// ==================== AGENT SELF ROUTES ====================
router.get('/me', protectVaultAgent, getAgentProfile);
router.put('/profile', protectVaultAgent, updateAgentProfile);
router.post('/change-password', protectVaultAgent, changePassword);

module.exports = router;