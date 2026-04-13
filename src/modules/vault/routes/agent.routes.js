const express = require('express');
const {
  agentSignup,
  adminOnboardFreelanceAgent,
  partnerOnboardAffiliatedAgent,
  agentLogin,
  verifyAgent,
  suspendAgent,
  activateAgent,
  deleteAgent,
  getAllAgents,
  getAgentsByPartner,
  getAgentById,
  updateAgentProfile,
  changePassword,
  getAgentDashboard,
  adminUpdateAgent,
  getAgentProfile,
  partnerUpdateAgent,
} = require('../controllers/agent.controller');
const { protect ,protectPartner,  protectVaultAgent,protectMulti  } = require('../../../middleware/auth');


const router = express.Router();
const protectEither = async (req, res, next) => {
  try {
    await protectVaultAgent(req, res, next); // ← protect → protectVaultAgent
  } catch (err) {
    try {
      await protectPartner(req, res, next);
    } catch (err2) {
      return res.status(401).json({
        message: 'Unauthorized (VaultAgent or Partner required)',
      });
    }
  }
};

// =========================
// PUBLIC ROUTES
// =========================
router.post('/signup', agentSignup);
router.post('/login', agentLogin);

// =========================
// ADMIN ONLY ROUTES (Role code 18)
// =========================
router.post('/admin/onboard-freelance', protect, adminOnboardFreelanceAgent);
router.post('/admin/verify/:id', protect, verifyAgent);
router.get('/admin/all-agents', protect, getAllAgents);
router.put('/admin/update/:id', protect, adminUpdateAgent); 
router.delete('/admin/delete/:id', protect, deleteAgent);

// =========================
// PARTNER ONLY ROUTES (Role code 21)
// =========================
router.post('/partner/onboard-affiliate', protectPartner, partnerOnboardAffiliatedAgent);
router.get('/partner/agents', protectPartner, getAgentsByPartner);
router.put('/partner/update/:id', protectPartner, partnerUpdateAgent); 
router.post('/partner/verify/:id', protectPartner, verifyAgent);

// =========================
// COMMON ROUTES (Admin, Partner, Agent can use based on permissions)
// =========================
router.post('/suspend/:id' ,protectMulti,suspendAgent);                            
  router.post('/activate/:id',protectMulti, activateAgent);
router.get('/get/:id',protectMulti, getAgentById);
router.delete('/delete/:id',protectMulti, deleteAgent);

// =========================
// AGENT SELF ROUTES
// =========================
router.get('/me', protectVaultAgent, getAgentProfile);           
router.get('/dashboard', protectVaultAgent, getAgentDashboard);  
router.put('/profile', protectVaultAgent, updateAgentProfile);   
router.post('/change-password', protectVaultAgent, changePassword);

module.exports = router;  