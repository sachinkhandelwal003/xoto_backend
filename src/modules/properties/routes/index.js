const Router = require("express");

const {
  createDeveloper,
  loginDeveloper,
  editDeveloper,
  getDeveloperrById,
  getAllDevelopers,
  deleteDeveloper,

  createProperty,
  editProperty,
  deleteProperty,
  getAllProperties,
  getPropertyById,
  MarketPlaceAPI,

  createInventory,
  bulkImportInventory,
  getInventoryByProperty,
  updateInventory,
  deleteInventory,

  reserveUnit,
  bookUnit,
  releaseUnit,

  getDeveloperLeads,
  getDeveloperLeadById,

  approveProperty,
  getApprovedProperties,
  updatePropertyStatus,

   getPropertiesByDeveloper,

   setCommissionScheme,
   getCommissionScheme,
   getDeveloperCommissions,
   getDeveloperRevenue,
   getDeveloperDashboard,

} = require("../controllers/index.js");

const router = Router();


// ---------------- DEVELOPER ----------------

router.post("/create-developer", createDeveloper);
router.post("/login-developer", loginDeveloper);

router.get("/get-all-developers", getAllDevelopers);
router.get("/get-developer-by-id", getDeveloperrById);
router.post("/edit-developer", editDeveloper);
router.post("/delete-developer-by-id", deleteDeveloper);


// ---------------- PROPERTYdfaf ----------------

router.post("/create-properties", createProperty);
router.post("/edit-property", editProperty);
router.post("/delete-property", deleteProperty);

router.get("/get-all-properties", getAllProperties);
router.get("/get-property-by-id", getPropertyById);

router.get("/marketplace", MarketPlaceAPI);

router.get(
  "/developers/:developerId/properties",
  getPropertiesByDeveloper
);

// ---------------- PROPERTY APPROVAL ----------------

router.put("/approve/:id", approveProperty);
router.get("/approved", getApprovedProperties);
router.put("/update-status/:id", updatePropertyStatus);


// ---------------- INVENTORY ----------------

router.post("/create-inventory", createInventory);

router.get("/inventory/property/:projectId", getInventoryByProperty);

router.put("/update-inventory/:id", updateInventory);

router.delete("/delete-inventory/:id", deleteInventory);

router.post("/bulk-import-inventory", bulkImportInventory);

// inventory actions
router.post("/inventory/:id/reserve", reserveUnit);
router.post("/inventory/:id/book", bookUnit);
router.post("/inventory/:id/release", releaseUnit);

// ---------------- DEVELOPER LEADS ----------------

router.get("/developer-leads", getDeveloperLeads);
router.get("/developer-lead/:id", getDeveloperLeadById);

// Commission

router.post("/commission", setCommissionScheme);

router.get("/commission/:propertyId", getCommissionScheme);
router.get("/developer-commissions/:developerId", getDeveloperCommissions);
router.get("/developer-revenue/:developerId", getDeveloperRevenue);

router.get("/developer-dashboard/:developerId",getDeveloperDashboard);

module.exports = router;