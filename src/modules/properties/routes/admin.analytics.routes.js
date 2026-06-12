const express = require("express");
const {
  getAdminOverview,
  getAdminLeadReports,
  exportLeadReport,
  getAdminListingReports,
  exportListingReport,
} = require("../controllers/admin.analytics.controller");
const { protectMulti } = require("../../../middleware/auth");

const router = express.Router();

// GET /properties/analytics/overview
router.get("/overview", protectMulti, getAdminOverview);

// GET /properties/analytics/leads
router.get("/leads", protectMulti, getAdminLeadReports);

// GET /properties/analytics/leads/export
router.get("/leads/export", protectMulti, exportLeadReport);

// GET /properties/analytics/listings
router.get("/listings", protectMulti, getAdminListingReports);

// GET /properties/analytics/listings/export
router.get("/listings/export", protectMulti, exportListingReport);

module.exports = router;
