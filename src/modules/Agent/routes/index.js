const express = require("express");
const { agentSignup, agentLogin, updateAgent, getAllAgents } = require("../controllers/index.js");

const route = express.Router();

route.post("/agent-signup", agentSignup);
route.post("/login-agent", agentLogin);
route.post("/update-agent", updateAgent); // Isme body me "agent_id" bhejna zaruri hai
route.get("/get-all-agents", getAllAgents);

module.exports = route;