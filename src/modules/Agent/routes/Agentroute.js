const express = require("express");

const {

createLead,
getLeadById,
updateLead,
deleteLead,
getAllLeads,
updateLeadStatus,
  createSiteVisit,
  getAllSiteVisits,
  getSiteVisitById,
  approveSiteVisit,
  updateSiteVisitStatus,
  rescheduleSiteVisit,
  getSiteVisitsByLead,
  getSiteVisitsByAgent,
  checkReminders,
} = require("../controllers/AgentController.js");
const { getPropertySuggestions } = require("../controllers/aiSuggestionController.js");
// const { createLeadInterest, getLeadInterests } = require("../controllers/LeadInterestController.js");


// const { protectMulti } =
// require("../../../middleware/auth");

const router = express.Router();


// sab routes protect
// router.use(protectMulti);

router.post("/create-lead",createLead);
router.get("/get-all-leads",getAllLeads);
router.get("/get-lead/:id",getLeadById);
router.post("/update-lead/:id",updateLead);
router.post("/update-status/:id",updateLeadStatus);
router.delete("/delete-lead/:id",deleteLead);

router.post("/ai-suggestions", getPropertySuggestions);
// router.post("/lead-interests", createLeadInterest);
// router.get("/lead-interests/:leadId", getLeadInterests);

//  Site Visit
router.post("/create-site-visit", createSiteVisit);
router.get("/get-all-site-visits", getAllSiteVisits);
router.get("/site-visit/:id", getSiteVisitById);
router.post("/approve-site-visit/:id", approveSiteVisit);
router.post("/update-site-visit/:id", updateSiteVisitStatus);
router.post("/reschedule-site-visit/:id", rescheduleSiteVisit);
// router.post("/cancel-site-visit/:id", cancelSiteVisit);

// Filter routes
router.get("/by-lead/:leadId", getSiteVisitsByLead);
router.get("/by-agent/:agentId", getSiteVisitsByAgent);

// Cron job route
router.get("/check-reminders", checkReminders);

module.exports = router;