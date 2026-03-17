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
updateSiteVisitStatus
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
router.post("/create-site-visit", createSiteVisit )
router.get("/site-visit/:id", getSiteVisitById)
router.get("/get-all-site-visits", getAllSiteVisits)
router.post("approve-site-visit/:id", approveSiteVisit)
router.post("/update-site-visit/:id", updateSiteVisitStatus);

module.exports = router;