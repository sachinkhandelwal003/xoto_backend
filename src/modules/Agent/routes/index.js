const express = require("express");
const { agentSignup, agentLogin, updateAgent, getAllAgents, getAgentById, deleteAgent} = require("../controllers/index.js");

const route = express.Router();

route.post("/agent-signup", agentSignup);
route.post("/login-agent", agentLogin);
route.post("/update-agent", updateAgent); // Isme body me "agent_id" bhejna zaruri hai
route.get("/get-all-agents", getAllAgents);
route.get("/agent/:id", getAgentById);     // Get by ID
route.delete("/agent/:id", deleteAgent);  // Delete

module.exports = route;