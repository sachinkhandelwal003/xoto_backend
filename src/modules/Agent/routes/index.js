const express = require("express");
const { agentSignup, agentLogin, updateAgent, getAllAgents, getAgentById, deleteAgent} = require("../controllers/index.js");

const route = express.Router();

route.post("/agent-signup", agentSignup);
route.post("/login-agent", agentLogin);
route.post("/update-agent", updateAgent); 
route.get("/get-all-agents", getAllAgents);
route.get("/get-agent-details/:id", getAgentById);     
route.delete("/delete-agent/:id", deleteAgent);  

module.exports = route;