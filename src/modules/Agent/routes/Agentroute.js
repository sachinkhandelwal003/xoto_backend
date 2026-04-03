// routes/leadRoutes.js
const express = require("express");
const {
  createLead,
  getLeadById,
  updateLead,
  deleteLead,
  getAllLeads,
  updateLeadStatus,
  selectProperty,
  fetchPropertySuggestions,
  addLeadInterest,
  removeLeadInterest
} = require("../controllers/AgentController");
const { protect, protectMulti } = require("../../../middleware/auth");

const {
  createSiteVisit,
  approveSiteVisit,
  updateSiteVisitStatus,
  rescheduleSiteVisit,
  getSiteVisitsByLead,
  getSiteVisitsByAgent,
  getAllSiteVisits,
  getSiteVisitById,
  checkReminders
} = require("../controllers/SiteVisitController");

const router = express.Router();

// =========================
// LEAD ROUTES
// =========================
router.post("/create-lead", protectMulti, createLead);
router.get("/get-all-leads", protectMulti, getAllLeads);
router.get("/get-lead/:id",protectMulti, getLeadById);
router.post("/update-lead/:id",protectMulti, updateLead);
router.post("/update-status/:id",protectMulti, updateLeadStatus);
router.delete("/delete-lead/:id",protectMulti, deleteLead);
router.put("/select-property",protectMulti, selectProperty);

// =========================
// PROPERTY SUGGESTIONS (AI)
// =========================
router.get("/fetch-properties",protectMulti, fetchPropertySuggestions);

// =========================
// LEAD INTERESTS (Manual Add/Remove)
// =========================
router.post("/add-interest",protectMulti, addLeadInterest);
router.delete("/remove-interest/:interestId",protectMulti, removeLeadInterest);

// =========================
// SITE VISIT ROUTES
// =========================
router.post("/create-site-visit",protectMulti, createSiteVisit);
router.get("/get-all-site-visits",protectMulti, getAllSiteVisits);
router.get("/site-visit/:id",protectMulti, getSiteVisitById);
router.post("/approve-site-visit/:id",protectMulti, approveSiteVisit);
router.post("/update-site-visit/:id",protectMulti, updateSiteVisitStatus);
router.post("/reschedule-site-visit/:id",protectMulti, rescheduleSiteVisit);
router.get("/by-lead/:leadId",protectMulti, getSiteVisitsByLead);
router.get("/by-agent/:agentId",protectMulti, getSiteVisitsByAgent);
router.get("/check-reminders",protectMulti, checkReminders);

module.exports = router;