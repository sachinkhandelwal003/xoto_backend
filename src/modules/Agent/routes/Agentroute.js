const express = require("express");

const {

createLead,
getLeadById,
updateLead,
deleteLead,
getAllLeads
} = require("../controllers/AgentController.js");

const { protectMulti } =
require("../../../middleware/auth");

const router = express.Router();


// sab routes protect
router.use(protectMulti);

router.post("/create-lead", createLead);

router.get("/get-lead-details/:id", getLeadById);
router.get("/get-all-leads", getAllLeads);
router.post("/update-lead/:id", updateLead);

router.delete("/delete-lead/:id", deleteLead);

module.exports = router;