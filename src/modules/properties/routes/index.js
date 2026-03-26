const express = require("express");
const router = express.Router();

const {
  // Developer
  createDeveloper,
  loginDeveloper,
  editDeveloper,
  getDeveloperrById,
  getAllDevelopers,
  deleteDeveloper,

  // Property
  createProperty,
  editProperty,
  deleteProperty,
  getAllProperties,
  getPropertyById,
  MarketPlaceAPI,
  updatePropertyStatus,
  getApprovedProperties,
  getPropertiesByDeveloper,
  getMyProperties,

  // Inventory
  createInventory,
  bulkImportInventory,
  getInventoryByProperty,
  updateInventory,
  deleteInventory,
  reserveUnit,
  bookUnit,
  releaseUnit,

  // Leads
  getDeveloperLeads,
  getDeveloperLeadById,

  // Commission
  setCommissionScheme,
  getCommissionScheme,
  getDeveloperCommissions,
  getDeveloperRevenue,
  getDeveloperDashboard

} = require("../controllers/index.js");

const { protectMulti, authorize } = require("../../../middleware/auth.js");

/* =========================================================
   🔹 DEVELOPER ROUTES
========================================================= */

router.post("/developer/create", createDeveloper);
router.post("/developer/login", loginDeveloper);

router.get("/developer/all", getAllDevelopers);
router.get("/developer/:id", getDeveloperrById);

router.put(
  "/developer/:id",
  protectMulti,
  authorize({ roles: ["admin"] }),
  editDeveloper
);

router.delete(
  "/developer/:id",
  protectMulti,
  authorize({ roles: ["admin"] }),
  deleteDeveloper
);

/* =========================================================
   🔹 PROPERTY ROUTES
========================================================= */

// ✅ CREATE
router.post(
  "/",
  protectMulti,
  authorize({ roles: ["agent", "admin", "developer"] }),
  createProperty
);

// ✅ GET ALL (PUBLIC)
router.get("/", getAllProperties);

// ✅ MARKETPLACE
router.get("/marketplace", MarketPlaceAPI);

// ✅ MY PROPERTIES
router.get(
  "/my",
  protectMulti,
  authorize({ roles: ["developer"] }),
  getMyProperties
);

// ✅ BY DEVELOPER
router.get(
  "/developer/:developerId/properties",
  getPropertiesByDeveloper
);

/* =========================================================
   🔹 ADMIN MODERATION (IMPORTANT ABOVE :id)
========================================================= */

// ✅ ADMIN LIST (FILTER)
router.get(
  "/admin",
  protectMulti,
  authorize({ roles: ["admin"] }),
  async (req, res) => {
    try {
      const { status } = req.query;

      let query = {
        listingType: "secondary",
      };

      if (status) query.approvalStatus = status;

      const properties = await require("../models/PropertyModel")
        .find(query)
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        data: properties,
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// ✅ UPDATE STATUS
router.put(
  "/status/:id",
  protectMulti,
  authorize({ roles: ["admin"] }),
  updatePropertyStatus
);

// ✅ APPROVED ONLY
router.get(
  "/approved",
  protectMulti,
  authorize({ roles: ["admin"] }),
  getApprovedProperties
);

/* =========================================================
   🔹 INVENTORY
========================================================= */

router.post("/inventory", protectMulti, createInventory);
router.get("/inventory/property/:projectId", getInventoryByProperty);
router.put("/inventory/:id", protectMulti, updateInventory);
router.delete("/inventory/:id", protectMulti, deleteInventory);
router.post("/inventory/bulk", protectMulti, bulkImportInventory);

router.post("/inventory/:id/reserve", protectMulti, reserveUnit);
router.post("/inventory/:id/book", protectMulti, bookUnit);
router.post("/inventory/:id/release", protectMulti, releaseUnit);

/* =========================================================
   🔹 LEADS
========================================================= */

router.get("/leads", protectMulti, getDeveloperLeads);
router.get("/leads/:id", protectMulti, getDeveloperLeadById);

/* =========================================================
   🔹 COMMISSION
========================================================= */

router.post("/commission", protectMulti, setCommissionScheme);
router.get("/commission/:propertyId", getCommissionScheme);

router.get("/developer/:developerId/commissions", getDeveloperCommissions);
router.get("/developer/:developerId/revenue", getDeveloperRevenue);
router.get("/developer/:developerId/dashboard", getDeveloperDashboard);

/* =========================================================
   🔹 SINGLE PROPERTY (ALWAYS LAST)
========================================================= */

router.get("/:id", getPropertyById);

// ✅ EDIT
router.put(
  "/:id",
  protectMulti,
  authorize({ roles: ["agent", "admin", "developer"] }),
  editProperty
);

// ✅ DELETE
router.delete(
  "/:id",
  protectMulti,
  authorize({ roles: ["admin", "developer"] }),
  deleteProperty
);

module.exports = router;