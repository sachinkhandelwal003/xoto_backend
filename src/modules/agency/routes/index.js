
const express = require("express");
const {agencySignup,agencyLogin,updateAgency,getAllAgencies,getAgencyById,deleteAgency} = require("../controllers/index.js");

const router = express.Router();

//agency signup
router.post("/agency-signup",agencySignup)
router.post("/agency-login",agencyLogin)
router.post("/update-agency",updateAgency)
router.get("/get-all-agencies",getAllAgencies)
router.get("/agency/:id",getAgencyById)     
router.delete("/agency/:id",deleteAgency)  


module.exports = router;
