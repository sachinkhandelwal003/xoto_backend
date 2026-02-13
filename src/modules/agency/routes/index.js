
const express = require("express");
const {agencySignup,agencyLogin,updateAgency,getAllAgencies,getAgencyById,deleteAgency} = require("../controllers/index.js");

const router = express.Router();

//agency signup
router.post("/agency-signup",agencySignup)
router.post("/agency-login",agencyLogin)
router.put("/update/:id", updateAgency);
router.get("/get-all-agencies",getAllAgencies)
router.get("/get-agency-details/:id",getAgencyById)     
router.delete("/delete-agency/:id",deleteAgency)  


module.exports = router;
