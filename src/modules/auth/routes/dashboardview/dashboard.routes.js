const express = require('express');
const router = express.Router();
const { superAdminDashboard,supervisorDashboard ,freelancerDashboard} = require('../../controllers/dashboardview/dashboard.controller');
const { protect, authorize } = require('../../../../middleware/auth');

router.get(
  '/view/superadmin',
  protect, // must be logged in
  superAdminDashboard
);


router.get(
  '/view/supervisor',
  supervisorDashboard
);

router.get(
  '/view/freelancer',
  freelancerDashboard
);

module.exports = router;
