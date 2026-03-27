const express = require("express");
const { protectMulti } = require("../../../middleware/auth");

const {
  agentSignup,
  agentLogin,
  updateAgent,
  getAllAgents,
  getAgentById,
  deleteAgent,
  approveAgent,
  rejectAgent,getAgencyAgentById,getAgencyAgents
} = require("../controllers/index");

const route = express.Router();

// =========================
// PUBLIC ROUTES
// =========================
route.post("/agent-signup", agentSignup);
route.post("/login-agent", agentLogin);

// =========================
// ADMIN ROUTES
// =========================
route.get("/get-all-agents", protectMulti, getAllAgents);
route.get("/get-agent-details/:id", protectMulti, getAgentById);
route.get("/get-agent-details/agency/:id", protectMulti, getAgencyAgentById);
route.get("/get-all-agents/agency", protectMulti, getAgencyAgents);

route.post("/update-agent", protectMulti, updateAgent);
route.delete("/delete-agent/:id", protectMulti, deleteAgent);
route.put("/approve-agent/:id", protectMulti, approveAgent);
route.put("/reject-agent/:id", protectMulti, rejectAgent);

module.exports = route;