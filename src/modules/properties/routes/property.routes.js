// routes/propertyRoutes.js

const Router = require("express");
const { protect, protectMulti } = require("../../../middleware/auth");

const {
    // Property Controllers
    createOffPlanProperty,
    getDeveloperProperties,
    getPropertyById,
    updateProperty,
    deleteProperty,
    createSecondaryProperty,
    getAgentProperties,
    getAllProperties,
    approveProperty,
    rejectProperty
  
} = require("../controllers/property.controller");

const {
   
    
    // Inventory Controllers
    createInventory,
    bulkImportInventory,
    getInventoryByProperty,
    updateInventory,
    deleteInventory,
    reserveUnit,
    bookUnit,
    releaseUnit,
    markAsSold
} = require("../controllers/inventory.controller");

const router = Router();

// =========================
// DEVELOPER PROPERTY ROUTES
// =========================
router.post("/developer/property/create-offplan", protectMulti, createOffPlanProperty);
router.get("/developer/property/offplan", protectMulti, getDeveloperProperties);
router.get("/developer/property/:id", protectMulti, getPropertyById);
router.put("/developer/property/:id", protectMulti, updateProperty);
router.delete("/developer/property/:id", protectMulti, deleteProperty);

// =========================
// AGENT PROPERTY ROUTES (Secondary)
// =========================
router.post("/agent/property/create-secondary", protectMulti, createSecondaryProperty);
router.get("/agent/property/secondary", protectMulti, getAgentProperties);
// In your routes file
router.get("/admin/property/all", protectMulti, getAllProperties);
// =========================
// INVENTORY ROUTES (Developer)
// =========================
router.post("/developer/inventory/create", protectMulti, createInventory);
router.post("/developer/inventory/bulk-import", protectMulti, bulkImportInventory);
router.get("/developer/inventory/:propertyId", protectMulti, getInventoryByProperty);
router.put("/developer/inventory/:id", protectMulti, updateInventory);
router.delete("/developer/inventory/:id", protectMulti, deleteInventory);

// =========================
// INVENTORY ACTIONS (Agent)
// =========================
router.post("/inventory/:id/reserve", protectMulti, reserveUnit);
router.post("/inventory/:id/book", protectMulti, bookUnit);
router.post("/inventory/:id/release", protectMulti, releaseUnit);
router.post("/inventory/:id/sold", protectMulti, markAsSold);

// =========================
// ADMIN PROPERTY ROUTES
// =========================
// router.get("/admin/property/all", protectMulti, getAllProperties);
router.put("/admin/property/approve/:id", protectMulti, approveProperty);
router.put("/admin/property/reject/:id", protectMulti, rejectProperty);

module.exports = router;