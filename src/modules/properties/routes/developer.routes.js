const Router = require("express");

const {
  // Developer Auth & Profile
  createDeveloper,
  loginDeveloper,
  editDeveloper,
  getDeveloperrById,
  getAllDevelopers,
  deleteDeveloper,
  
  // Developer Profile (Authenticated)
  getMyProfile,
  updateMyProfile,
  approvePlan ,
  // Developer KYC
  submitKYC,
  getKYCStatus,
  
  // Developer Agreement
  uploadAgreement,
  getAgreement,
  
  // Admin - KYC Review
  reviewKYC,
  
  // Admin - Agreement Upload
  adminUploadAgreement,
  
  // Admin - Agreement Verification (NEW)
  verifyAgreement,
  requestAgreementChanges,
  
  // Admin - Engagement Plan
  setEngagementPlan,
  
  // Admin - Stats & Status
  getDeveloperStats,
  toggleAccountStatus,

} = require("../controllers/developer.controller");
const { protect, protectMulti } = require('../../../middleware/auth');

const router = Router();

// =========================
// PUBLIC ROUTES
// =========================
router.post("/create-developer", createDeveloper);
router.post("/login-developer", loginDeveloper);

// =========================
// PROTECTED ROUTES (All routes below require auth)
// =========================
router.use(protectMulti);

// =========================
// DEVELOPER ROUTES (AUTHENTICATED)
// =========================
router.get("/me", getMyProfile);
router.put("/profile", updateMyProfile);
router.post("/kyc/submit", submitKYC);
router.get("/kyc/status", getKYCStatus);
router.post("/agreement/upload", uploadAgreement);
router.get("/agreement", getAgreement);

// =========================
// ADMIN ROUTES
// =========================

// Developer Management
router.get("/get-all-developers", getAllDevelopers);
router.get("/get-developer-by-id", getDeveloperrById);
router.post("/edit-developer", editDeveloper);
router.post("/delete-developer-by-id", deleteDeveloper);
router.put("/admin/suspend/:id", toggleAccountStatus);

// Stats
router.get("/admin/stats", getDeveloperStats);

// KYC Management
router.put("/admin/review-kyc/:id", reviewKYC);

// Agreement Management
router.put("/admin/upload-agreement/:id", adminUploadAgreement);
router.put("/admin/verify-agreement/:id", verifyAgreement);           // ✅ NEW - Approve agreement
router.post("/admin/request-changes/:id", requestAgreementChanges);   // ✅ NEW - Request changes
router.put("/admin/approve-plan/:id", approvePlan);  // ← Admin approves plan after payment

// Engagement Plan
router.put("/admin/set-plan/:id", setEngagementPlan);

module.exports = router;