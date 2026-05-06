const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const Agency  = require('../models/index');
const { protectMulti, authorize } = require("../../../../middleware/auth");
const ctrl = require('../controllers/index.js');

// ─────────────────────────────────────────────────────────────────────────────
// Agency Auth Middleware
// ─────────────────────────────────────────────────────────────────────────────
const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token)
      return res.status(401).json({ success: false, message: 'Not authorised. No token provided.' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role?.name !== 'Agency' && decoded.role?.code !== '1')
      return res.status(403).json({ success: false, message: 'Access denied. Not an agency account.' });

    const agency = await Agency.findById(decoded.id).select('-password');
    if (!agency || !agency.isActive)
      return res.status(401).json({ success: false, message: 'Agency account not found or inactive.' });

    if (agency.isSuspended)
      return res.status(403).json({ success: false, message: 'Account suspended. Contact Xoto Admin.' });

    req.agency = agency;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. PUBLIC ROUTES (Agency Auth)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/auth/login',          ctrl.login);
router.post('/auth/request-otp',    ctrl.requestOTP);
router.post('/auth/verify-otp',     ctrl.verifyOTP);
router.post('/auth/reset-password', ctrl.resetPassword);

// ─────────────────────────────────────────────────────────────────────────────
// 2. ADMIN-ONLY ROUTES (require admin or superadmin JWT)
// ─────────────────────────────────────────────────────────────────────────────
// ── Agency management ─────────────────────────────────────────────────────
router.post('/admin/create-agency',
  protectMulti,
  authorize({ roles: ['admin', 'superadmin'] }),
  ctrl.createAgencyByAdmin
);
router.get('/admin/agencies',
  protectMulti,
  authorize({ roles: ['admin', 'superadmin'] }),
  ctrl.getAllAgencies
);
router.get('/admin/agencies/:id',
  protectMulti,
  authorize({ roles: ['admin', 'superadmin'] }),
  ctrl.getAgencyById
);
router.put('/admin/agencies/:id/suspend',
  protectMulti,
  authorize({ roles: ['admin', 'superadmin'] }),
  ctrl.suspendAgency
);
router.put('/admin/agencies/:id/activate',
  protectMulti,
  authorize({ roles: ['admin', 'superadmin'] }),
  ctrl.activateAgency
);
router.put('/admin/agents/:agentId/reset',
  protectMulti,
  authorize({ roles: ['admin', 'superadmin'] }),
  ctrl.resetAgentDecline
);

// ── Admin Agent Management (all agents across all agencies) ──────────────
router.get('/admin/agents',
  protectMulti,
  authorize({ roles: ['admin', 'superadmin'] }),
  ctrl.getAllAgents
);

// ✅ THIS IS MISSING — add it
router.get('/admin/agents/:agentId',
  protectMulti,
  authorize({ roles: ['admin', 'superadmin'] }),
  ctrl.getAgentByIdAdmin
);

router.put('/admin/agents/:agentId/approve',
  protectMulti,
  authorize({ roles: ['admin', 'superadmin'] }),
  ctrl.adminApproveAgent
);
router.put('/admin/agents/:agentId/decline',
  protectMulti,
  authorize({ roles: ['admin', 'superadmin'] }),
  ctrl.adminDeclineAgent
);

// ── Public: list of active agencies (for registration dropdown) ─────────
router.get('/public/agencies', ctrl.getPublicAgencies);

// ── Public: agent self‑registration (no token) ──────────────────────────
router.post('/public/register-agent', ctrl.registerAgent);

// ─────────────────────────────────────────────────────────────────────────────
// 3. AGENCY PROTECTED ROUTES (require agency JWT)
// ─────────────────────────────────────────────────────────────────────────────
router.use(protect);

// ── Dashboard ────────────────────────────────────────────────────────────────
router.get('/dashboard', ctrl.getDashboard);

// ── Profile ──────────────────────────────────────────────────────────────────
router.get('/profile',   ctrl.getProfile);
router.put('/profile', ctrl.updateProfile);

// ── Agent Team ───────────────────────────────────────────────────────────────
router.post('/agents',                   ctrl.createAgent);   
router.get('/agents',                    ctrl.getAgents);
router.get('/agents/:agentId',           ctrl.getAgentDetail);
router.put('/agents/:agentId/approve',   ctrl.approveAgent);
router.put('/agents/:agentId/decline',   ctrl.declineAgent);
router.put('/agents/:agentId/flag',      ctrl.flagAgent);

// ── Leads & Listings ─────────────────────────────────────────────────────────
router.get('/leads',    ctrl.getAgencyLeads);
router.get('/listings', ctrl.getAgencyListings);

module.exports = router;