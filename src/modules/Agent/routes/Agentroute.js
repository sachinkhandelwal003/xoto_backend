const express = require("express");

const {

createLead,
getLeadById,
updateLead,
deleteLead,
getAllLeads,
updateLeadStatus
} = require("../controllers/AgentController.js");

// const { protectMulti } =
// require("../../../middleware/auth");

const router = express.Router();


// sab routes protect
// router.use(protectMulti);

router.post("/create-lead",createLead);
router.get("/get-all-leads",getAllLeads);
router.get("/get-lead/:id",getLeadById);
router.patch("/update-lead/:id",updateLead);
router.patch("/update-status/:id",updateLeadStatus);
router.delete("/delete-lead/:id",deleteLead);

module.exports = router;