const express = require("express");
const router = express.Router();
const agentCtrl = require("../controllers/index");
const leadCtrl = require("../../Lead/controller/gridLead.controller");
const { protectMulti } = require("../../../../middleware/auth");

router.post("/agent-signup", agentCtrl.agentSignup);
router.post("/login-agent", agentCtrl.agentLogin);
// Agent dashboard (self)
router.get('/dashboard', protectMulti, agentCtrl.getDashboard);
router.get('/leaderboard', protectMulti, agentCtrl.getLeaderboard);
router.get('/agreements', protectMulti, agentCtrl.getMyAgreements);
router.post('/agreements/documents', protectMulti, agentCtrl.addMyAgreementDocument);
router.post('/agreements/:id/documents', protectMulti, agentCtrl.addAgreementDocument);
router.patch('/agreements/:id/documents/:documentId', protectMulti, agentCtrl.updateAgreementDocument);
router.delete('/agreements/:id/documents/:documentId', protectMulti, agentCtrl.deleteAgreementDocument);

// Backward-compatible agent lead routes.
// Current canonical routes live under /gridlead/agent/*, but older clients call /agent/lead/*.
router.use("/lead", protectMulti);
router.post("/lead/create-lead", leadCtrl.createLead);
router.get("/lead/get-all-leads", leadCtrl.getAgentOwnLeads);
router.get("/lead/my-leads", leadCtrl.getAgentOwnLeads);
router.get("/lead/stats", leadCtrl.getAgentStats);
router.get("/lead/get-lead/:id", leadCtrl.getLeadById);
router.get("/lead/:id", leadCtrl.getLeadById);
router.post("/lead/:id/save-matches", leadCtrl.saveMatchedListings);
router.post("/lead/:id/submit-to-xoto", leadCtrl.submitLeadToXoto);
router.post("/lead/:id/update-requirements", leadCtrl.agentUpdateRequirements);
router.put("/lead/:id/update-requirements", leadCtrl.agentUpdateRequirements);
router.post("/lead/:id/note", leadCtrl.addAgentNote);

module.exports = router;
