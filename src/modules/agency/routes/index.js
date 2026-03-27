const express = require("express");
const { protectMulti } = require("../../../middleware/auth");

const {
  agencySignup,
  agencyLogin,
  getAgencyById,
  getAllAgencies,
  updateAgency,
  deleteAgency,
  approveAgency,
  rejectAgency,
  getAgencyProfile,
  updateAgencyProfile,
  getAgencyAgents,
  addAgentToAgency,
  removeAgentFromAgency
} = require("../controllers/index");

const router = express.Router();

// =========================
// PUBLIC ROUTES
// =========================
router.post("/agency-signup", agencySignup);
router.post("/agency-login", agencyLogin);

// =========================

// AGENCY PROTECTED ROUTES (Agency Owner)
// =========================
router.get("/agency/me", protectMulti, getAgencyProfile);
router.put("/agency/profile", protectMulti, updateAgencyProfile);
router.get("/agency/agents", protectMulti, getAgencyAgents);
router.post("/agency/add-agent", protectMulti, addAgentToAgency);
router.post("/agency/remove-agent", protectMulti, removeAgentFromAgency);

// =========================
// ADMIN ROUTES
// =========================
router.get("/get-all-agencies", protectMulti, getAllAgencies);
router.get("/get-agency-details/:id", protectMulti, getAgencyById);
router.put("/update-agency/:id", protectMulti, updateAgency);
router.delete("/delete-agency/:id", protectMulti, deleteAgency);
router.put("/approve-agency/:id", protectMulti, approveAgency);
router.put("/reject-agency/:id", protectMulti, rejectAgency);

module.exports = router;