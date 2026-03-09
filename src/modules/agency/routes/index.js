
const express = require("express");
const {agencySignup,agencyLogin,updateAgency,getAllAgencies,getAgencyById,deleteAgency,getAgencyLeads,assignLead,updateLeadStatus   } = require("../controllers/index.js");
const { protectMulti } = require("../../../middleware/auth");
const router = express.Router();

//agency signup
router.post("/agency-signup",agencySignup)
router.post("/agency-login",agencyLogin)
router.put("/update/:id", updateAgency);
router.get("/get-all-agencies",getAllAgencies)
router.get("/get-agency-details/:id",getAgencyById)     
router.delete("/delete-agency/:id",deleteAgency)  
router.get("/get-leads", protectMulti, getAgencyLeads);
router.post("/assign-lead", protectMulti, assignLead);
router.put("/update-lead-status/:id", protectMulti, updateLeadStatus);


module.exports = router;
