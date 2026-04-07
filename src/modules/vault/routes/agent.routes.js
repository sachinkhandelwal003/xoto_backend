const express = require('express');
const {
  agentSignup,
  agentLogin,
  getAllAgents,
  getAgentById,
  updateAgent,
  deleteAgent,
  verifyAffiliatedAgent,
  suspendAgent,
  activateAgent,
  getAgentDashboard,
  updateAgentProfile,
  changePassword,
  
  getAgentsByPartner,adminOnboardFreelanceAgent,partnerOnboardAffiliatedAgent 
} = require('../controllers/agent.controller');
const { protect, protectMulti ,protectPartner } = require('../../../middleware/auth');

const router = express.Router();

// =========================
// PUBLIC ROUTES
// =========================
router.post('/signup', agentSignup);
router.post('/login', agentLogin);
router.post('/admin/onboard-freelance', protect, adminOnboardFreelanceAgent);
router.post('/admin/onboard-affiliate', protect, partnerOnboardAffiliatedAgent );


// =========================
// AGENT SELF ROUTES (Logged in Agent)
// =========================
router.get('/dashboard', protect, getAgentDashboard);
router.put('/profile', protect, updateAgentProfile);
router.post('/change-password', protect, changePassword);
router.get('/me', protect, getAgentById);

// =========================
// ADMIN ONLY ROUTES
// =========================
router.get('/all', protect,protectPartner, getAllAgents);
router.get('/get/:id', protect, getAgentById);
router.put('/update/:id', protect, updateAgent);
router.delete('/delete/:id', protect, deleteAgent);
router.post('/suspend/:id', protect, suspendAgent);
router.post('/activate/:id', protect, activateAgent);
router.post('/verify-affiliation/:id', protect, verifyAffiliatedAgent);

// =========================
// PARTNER ONLY ROUTES (Get agents under partner)
// =========================
router.get('/partner/agents', protect, getAgentsByPartner);

module.exports = router;