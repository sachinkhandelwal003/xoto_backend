import express from "express";
import {
  createPartner,
  partnerLogin,
  getAllPartners,
  getPartnerById,
  updatePartner,
  deletePartner,
  suspendPartner,
  activatePartner,
  getPartnerDashboard,
  createCase,
  getPartnerCases,
  getCaseById,
  createProposal,
  getPartnerProposals,
  getAffiliatedAgents,
  getPartnerCommissions,
  changePassword
} from "../controllers/partner.controller.js";
import { protect, protectMulti } from "../../../middleware/auth.js";

const router = express.Router();

// =========================
// AUTH ROUTES
// =========================
router.post("/login", partnerLogin);
router.post("/change-password", protect, changePassword);

// =========================
// PARTNER MANAGEMENT (Admin only)
// =========================
router.post("/create", protect, createPartner);
router.get("/all", protect, getAllPartners);
router.get("/get/:id", protect, getPartnerById);
router.put("/update/:id", protect, updatePartner);
router.delete("/delete/:id", protect, deletePartner);
router.post("/suspend/:id", protect, suspendPartner);
router.post("/activate/:id", protect, activatePartner);

// =========================
// PARTNER DASHBOARD
// =========================
router.get("/dashboard", protect, getPartnerDashboard);

// =========================
// CASE MANAGEMENT
// =========================
router.post("/create-case", protect, createCase);
router.get("/cases", protect, getPartnerCases);
router.get("/case/:id", protect, getCaseById);

// =========================
// PROPOSAL MANAGEMENT
// =========================
router.post("/create-proposal", protect, createProposal);
router.get("/proposals", protect, getPartnerProposals);

// =========================
// AGENT MANAGEMENT
// =========================
router.get("/agents", protect, getAffiliatedAgents);

// =========================
// COMMISSION
// =========================
router.get("/commissions", protect, getPartnerCommissions);

module.exports = router;