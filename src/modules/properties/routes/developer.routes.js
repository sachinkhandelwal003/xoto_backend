const Router = require("express");

const {
  // Developer Auth & Profile
  createDeveloper,
  loginDeveloper,
  editDeveloper,
  getDeveloperrById,
 // getDeveloperrById,,
  getAllDevelopers,
  deleteDeveloper,
  
  // Developer Profile (Authenticated)
  getMyProfile,
  updateMyProfile,
  
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
  
  // Admin - Engagement Plan
  setEngagementPlan,
  
  // Admin - Stats & Status
  getDeveloperStats,
  toggleAccountStatus,

} = require("../controllers/developer.controller");
const { protect, protectMulti } = require('../../../middleware/auth');

const router = Router();


router.post("/create-developer", createDeveloper);
router.post("/login-developer", loginDeveloper);

router.use(protectMulti);

// =========================
// PUBLIC ROUTES
// =========================


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
router.get("/get-all-developers", getAllDevelopers);
router.get("/get-developer-by-id", getDeveloperrById);
router.post("/edit-developer", editDeveloper);
router.post("/delete-developer-by-id", deleteDeveloper);
router.get("/admin/stats", getDeveloperStats);
router.put("/admin/review-kyc/:id", reviewKYC);
router.put("/admin/upload-agreement/:id", adminUploadAgreement);
router.put("/admin/set-plan/:id", setEngagementPlan);
router.put("/admin/suspend/:id", toggleAccountStatus);

module.exports = router;