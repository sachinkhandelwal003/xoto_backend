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
  getAgentDashboard
} = require('../controllers/agent.controller');
const { protect ,protectPartner  } = require('../../../middleware/auth');


const router = express.Router();
const protectEither = async (req, res, next) => {
  try {
    // Try normal user
    await protect(req, res, next);
  } catch (err) {
    try {
      // If failed, try partner
      await protectPartner(req, res, next);
    } catch (err2) {
      return res.status(401).json({
        message: 'Unauthorized (User or Partner required)',
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
router.delete('/admin/delete/:id', protect, deleteAgent);

// =========================
// PARTNER ONLY ROUTES (Role code 21)
// =========================
router.post('/partner/onboard-affiliate', protectPartner, partnerOnboardAffiliatedAgent);
router.get('/partner/agents', protectPartner, getAgentsByPartner);

// =========================
// COMMON ROUTES (Admin, Partner, Agent can use based on permissions)
// =========================
router.post('/suspend/:id' ,protectEither,suspendAgent);                            
  router.post('/activate/:id',protectEither, activateAgent);
router.get('/get/:id',protectEither, getAgentById);
router.delete('/delete/:id',protectEither, deleteAgent);

// =========================
// AGENT SELF ROUTES
// =========================
router.get('/dashboard', getAgentDashboard);
router.get('/me', getAgentById);
router.put('/profile', updateAgentProfile);
router.post('/change-password', changePassword);

module.exports = router;