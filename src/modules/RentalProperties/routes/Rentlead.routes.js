const express = require("express");
const router = express.Router();

// 🔐 Only import 'protect' from your existing auth middleware
const { protect } = require("../../../middleware/auth");

const {
  createLead,
  getLeads,
  getSingleLead,
  assignAgent,
  updateStatus,
  deleteLead,
} = require("../controllers/Rentlead.controller"); 

// ─── CUSTOM ADMIN GUARD ───────────────────────────────────────────────────────
// Built from your actual token structure:
// { role: { isSuperAdmin: true, code: "0", name: "SuperAdmin" } }
const isAdmin = (req, res, next) => {
  const role = req.user?.role;

  const allowed =
    role?.isSuperAdmin === true ||
    role?.code === "0" ||
    role?.name === "SuperAdmin" ||
    role?.name === "Admin";

  if (!allowed) {
    return res.status(403).json({
      success: false,
      message: "Access denied. Admin only.",
    });
  }

  next();
};

// ── CUSTOMER ──────────────────────────────────────────────────────────────────
router.post("/create", protect, createLead);

// ── ADMIN ─────────────────────────────────────────────────────────────────────
router.get("/all", protect, isAdmin, getLeads);
router.put("/:id/assign", protect, isAdmin, assignAgent);
router.put("/:id/status", protect, isAdmin, updateStatus);
router.delete("/:id", protect, isAdmin, deleteLead);

// ⚠️ IMPORTANT: /:id MUST be last — warna "all", "assign" bhi match ho jaata
router.get("/:id", protect, isAdmin, getSingleLead);

module.exports = router;