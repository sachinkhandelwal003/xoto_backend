const express    = require("express");
const router     = express.Router();
const controller = require("../controllers/adminController");
// const adminAuth  = require("../middleware/authMiddleware");

// ─── AUTH ─────────────────────────────────────────────────────────────────────
router.post("/login", controller.loginAdmin);

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
router.get("/dashboard", controller.getDashboardStats);

// ─── AGENTS ──────────────────────────────────────────────────────────────────
// GET  /admin/agents               — list all agents (filter by agentType, affiliationStatus)
// PUT  /admin/agents/:id/status    — suspend or activate an agent
// PUT  /admin/agents/:id/affiliation — approve or reject partner affiliation
router.get("/agents",                      controller.getAllAgents);
router.put("/agents/:id/status",           controller.toggleAgentStatus);
router.put("/agents/:agentId/affiliation",  controller.verifyAgentAffiliation);
router.post("/agents", controller.createAgent);

// ─── PARTNERS ─────────────────────────────────────────────────────────────────
// GET  /admin/partners    — list all partners
// POST /admin/partners    — create partner (offline onboarding per PRD)
router.get("/partners",  controller.getAllPartners);
router.post("/partners", controller.createPartner);

// ─── CLIENTS ─────────────────────────────────────────────────────────────────
// GET  /admin/clients     — list all clients (search, paginate)
// POST /admin/clients     — create client record
router.get("/clients",  controller.getAllClients);
router.post("/clients", controller.createClient);

// ─── LEADS (renamed from Referrals) ──────────────────────────────────────────
// GET  /admin/leads          — list all leads
// PUT  /admin/leads/:id/status — update lead status (Admin updates per PRD)
router.get("/leads",             controller.getAllLeads);
router.put("/leads/:id/status",  controller.updateLeadStatus);

// ─── CASES ────────────────────────────────────────────────────────────────────
// GET  /admin/cases            — list all cases (filter by status, partnerId)
// PUT  /admin/cases/:id/status — update case status (Admin updates per PRD)
router.get("/cases",             controller.getAllCases);
router.put("/cases/:id/status",  controller.updateCaseStatus);

// ─── COMMISSIONS ──────────────────────────────────────────────────────────────
// PUT  /admin/commissions/:id/confirm — confirm commission & set xotoCommissionReceived
router.put("/commissions/:id/confirm", controller.confirmCommission);

module.exports = router;