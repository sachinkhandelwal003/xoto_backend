const express = require('express');
const router = express.Router();
const { superAdminDashboard,supervisorDashboard ,freelancerDashboard,vendorDashboard,customerDashboard} = require('../../controllers/dashboardview/dashboard.controller');
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

router.get(
  '/view/vendor',
  vendorDashboard
);

router.get(
  '/view/customer',
  customerDashboard
);

module.exports = router;
