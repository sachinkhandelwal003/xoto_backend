const express = require('express');
const router = express.Router();
const { superAdminDashboard } = require('../../controllers/dashboardview/dashboard.controller');
const { protect, authorize } = require('../../../../middleware/auth');

router.get(
  '/view/superadmin',
  protect, // must be logged in
  superAdminDashboard
);

module.exports = router;
