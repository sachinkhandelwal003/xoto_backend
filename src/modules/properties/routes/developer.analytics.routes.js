const express = require("express");
const {
  getDeveloperAnalytics,
  getInterestTrend,
  exportAnalyticsCSV,
} = require("../controllers/developer.analytics.controller");
const { protect } = require("../../../middleware/auth");

const router = express.Router();

// Main analytics dashboard
// GET /developer/analytics?fromDate=&toDate=&projectId=&unitType=
router.get("/", protect, getDeveloperAnalytics);

// Interest trend chart (daily / weekly)
// GET /developer/analytics/trend?fromDate=&toDate=&projectId=&granularity=daily|weekly
router.get("/trend", protect, getInterestTrend);

// CSV export
// GET /developer/analytics/export?fromDate=&toDate=&projectId=&unitType=
router.get("/export", protect, exportAnalyticsCSV);

module.exports = router;
