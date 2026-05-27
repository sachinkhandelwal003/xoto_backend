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

  // Commission
  setAgentInternalCommission,
  setPartnerDefaultAgentCommission,

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

// ==================== PARTNER ONLY (Role code 21) ====================
router.post('/partner/onboard-affiliate', protectPartner, partnerOnboardAffiliatedAgent);
router.post('/partner/verify/:id', protectPartner, verifyAgent);
router.get('/partner/agents', protectPartner, getAgentsByPartner);
router.put('/partner/agents/:id/commission', protectPartner, setAgentInternalCommission);
router.put('/partner/default-commission', protectPartner, setPartnerDefaultAgentCommission);

// ==================== COMMON (Admin, Partner, or Self) ====================
router.post('/suspend/:id', protectMulti, suspendAgent);
router.post('/activate/:id', protectMulti, activateAgent);
router.get('/get/:id', protectMulti, getAgentById);

// ==================== AGENT SELF ROUTES ====================
router.get('/me', protectVaultAgent, getAgentProfile);
router.put('/profile', protectVaultAgent, updateAgentProfile);
router.post('/change-password', protectVaultAgent, changePassword);

module.exports = router;