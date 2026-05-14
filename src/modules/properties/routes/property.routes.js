const router = require("express").Router();
const { protectMulti } = require("../../../middleware/auth");
const inventoryCategories = require("../config/inventory.categories.config");

// Debug: Import and check what we're getting
const indexExports = require("../controllers/index.js");



const {
  createProperty,
  getProperties,
  getPropertyById,
  updateProperty,
  deleteProperty,
  approveProperty,
  rejectProperty,
  toggleListingStatus,
  toggleFeatured,
  getHotProperties,
  toggleHotProperty,
  toggleFavourite,
  getFavourites,
  requestChanges,
  getRequiredConfigForProperty,
  getDeveloperDashboard
} = require("../controllers/property.controller");

const {
  createInventory,
  bulkImportInventory,
  getInventoryByProperty,
  updateInventory,
  deleteInventory,
  reserveUnit,
  bookUnit,
  releaseUnit,
  autoGenerateInventory
} = require("../controllers/inventory.controller.js"); 


router.get("/hot", getHotProperties);          // public
router.get("/public", getProperties);
router.put("/:id/hot", protectMulti, toggleHotProperty);


// Fav Property 
router.post("/favourites/toggle", protectMulti, toggleFavourite);  // like/unlike
router.get("/favourites", protectMulti, getFavourites);             // saved properties

// Inventory Categories
router.get("/inventory-categories", (req, res) => {
  res.status(200).json({
    success: true,
    data: inventoryCategories
  });
});

router.get("/inventory-categories/:category", (req, res) => {
  const category = req.params.category;
  if (!inventoryCategories[category]) {
    return res.status(404).json({
      success: false,
      message: "Category not found"
    });
  }
  res.status(200).json({
    success: true,
    data: inventoryCategories[category]
  });
});

// Developer Dashboard
router.get("/developer/dashboard", protectMulti, getDeveloperDashboard);

// Get required config for a specific property
router.get("/:propertyId/required-config", protectMulti, getRequiredConfigForProperty);

router.get("/", protectMulti, getProperties);

// ════════════════════════════════════════════════════════════════════════════
// PROPERTY ROUTES
// ════════════════════════════════════════════════════════════════════════════
//
// POST   /property                   Create listing
//                                    Developer  → off_plan only (body: propertySubType)
//                                    Admin      → secondary | rental | commercial
//                                    Admin      → off_plan on behalf of developer (body: developerId)
//
// GET    /property                   Get all listings
//                                    Admin      → all, all statuses + stats
//                                    Developer  → own off-plan only
//                                    Advisor    → approved + active catalogue (PRD §7.3)
//                                    Agent      → approved + active catalogue (PRD §8.3)
//
// GET    /property/:id               Get single listing
//
// PATCH  /property/:id               Update listing
//                                    Developer  → own pending/rejected off-plan only
//                                    Admin      → anything (staff admin edits live → pending)
//
// DELETE /property/:id               Delete listing
//                                    Developer  → own pending/rejected off-plan only
//                                    Admin      → anything
//
// PATCH  /property/:id/approve       Admin approve listing → goes live
// PATCH  /property/:id/reject        Admin reject listing  → body: { rejectionReason }
// PATCH  /property/:id/toggle-status Admin toggle active ↔ inactive
// PATCH  /property/:id/feature       Super admin toggle featured (PRD §12.6)
//
// ── Query filters on GET /property ──────────────────────────────────────────
//   propertySubType    off_plan | secondary | rental | commercial
//   approvalStatus     pending | approved | rejected          [admin only]
//   listingStatus      pending | active | rejected | inactive [admin only]
//   developerId                                               [admin only]
//   area, city, country
//   unitType, bedroomType, bedrooms, bathrooms
//   minPrice, maxPrice
//   minArea, maxArea
//   furnishing, hasView, parkingSpaces
//   projectStatus      presale | under_construction | ready | sold_out
//   completionYear, completionQuarter
//   rentalFrequency    monthly | quarterly | yearly
//   isImmediate        true | false
//   isShortTerm        true | false
//   isFeatured         true | false
//   isAvailable        true | false                           [admin only]
//   fromDate, toDate                                          [admin only]
//   search
//   sortBy             price | createdAt | updatedAt
//   sortOrder          asc | desc
//   page, limit
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// INVENTORY ROUTES (MUST COME BEFORE :id ROUTE!)
// ════════════════════════════════════════════════════════════════════════════
router.post("/inventory", protectMulti, createInventory);
router.post("/inventory/auto-generate", protectMulti, autoGenerateInventory);
router.post("/inventory/bulk", protectMulti, bulkImportInventory);
router.get("/inventory", protectMulti, getInventoryByProperty);
router.patch("/inventory/:id", protectMulti, updateInventory);
router.delete("/inventory/:id", protectMulti, deleteInventory);
router.post("/inventory/:id/reserve", protectMulti, reserveUnit);
router.post("/inventory/:id/book", protectMulti, bookUnit);
router.post("/inventory/:id/release", protectMulti, releaseUnit);

// ════════════════════════════════════════════════════════════════════════════
// PROPERTY ROUTES
// ════════════════════════════════════════════════════════════════════════════
router.post("/", protectMulti, createProperty);
router.get("/", protectMulti, getProperties);
router.get("/:id", protectMulti, getPropertyById);
router.patch("/:id", protectMulti, updateProperty);
router.delete("/:id", protectMulti, deleteProperty);
router.put("/:id/approve", protectMulti, approveProperty);
router.put("/:id/reject", protectMulti, rejectProperty);
router.put("/:id/request-changes", protectMulti, requestChanges);
router.put("/:id/toggle-status", protectMulti, toggleListingStatus);
router.put("/:id/feature", protectMulti, toggleFeatured);

module.exports = router;