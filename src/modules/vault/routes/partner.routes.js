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
  ,getPartnersForDropdown
  
} from "../controllers/partner.controller.js";
import { protect, protectMulti ,protectPartner} from "../../../middleware/auth.js";

const router = express.Router();

// =========================
// AUTH ROUTES
// =========================
router.post("/login", partnerLogin);
router.post("/change-password", protectPartner, changePassword);

// =========================
// PARTNER MANAGEMENT (Admin only)
// =========================
router.post("/create", protect, createPartner);
router.get("/all", protect, getAllPartners);
router.get("/dropdown", getPartnersForDropdown);
router.get("/get/:id", protect, getPartnerById);
router.put("/update/:id", protect, updatePartner);
router.delete("/delete/:id", protect, deletePartner);
router.post("/suspend/:id", protect, suspendPartner);
router.post("/activate/:id", protect, activatePartner);

// =========================
// PARTNER DASHBOARD
// =========================
router.get("/dashboard", protectPartner, getPartnerDashboard);

// =========================
// CASE MANAGEMENT
// =========================
router.post("/create-case", protectPartner, createCase);
router.get("/cases", protectPartner, getPartnerCases);
router.get("/case/:id", protectPartner, getCaseById);

// =========================
// PROPOSAL MANAGEMENT
// =========================
router.post("/create-proposal", protectPartner, createProposal);
router.get("/proposals", protectPartner, getPartnerProposals);

// =========================
// AGENT MANAGEMENT
// =========================
router.get("/agents", protectPartner, getAffiliatedAgents);

// =========================
// COMMISSION
// =========================
router.get("/commissions", protectPartner, getPartnerCommissions);

module.exports = router;