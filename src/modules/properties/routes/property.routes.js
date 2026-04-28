const router = require("express").Router();
const { protectMulti } = require("../../../middleware/auth");

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
} = require("../controllers/property.controller");

const {
  createInventory,
  bulkImportInventory,
  getInventoryByProperty,
  getSingleInventory,
  updateInventory,
  deleteInventory,
  reserveUnit,
  bookUnit,
  releaseUnit,
  markAsSold,

} = require("../controllers/inventory.controller");


router.get("/hot", getHotProperties);          // public
router.put("/:id/hot", protectMulti, toggleHotProperty);
router.get("/", protectMulti, getProperties);
router.get("/:id", protectMulti, getPropertyById);

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

router.post("/", protectMulti, createProperty);
router.get("/", protectMulti, getProperties);
router.get("/:id", protectMulti, getPropertyById);
router.put("/:id", protectMulti, updateProperty);
router.delete("/:id", protectMulti, deleteProperty);
router.put("/:id/approve", protectMulti, approveProperty);
router.put("/:id/reject", protectMulti, rejectProperty);
router.patch("/:id/toggle-status", protectMulti, toggleListingStatus);
router.patch("/:id/feature", protectMulti, toggleFeatured);

// ════════════════════════════════════════════════════════════════════════════
// INVENTORY ROUTES
// ════════════════════════════════════════════════════════════════════════════
//
// POST   /inventory               Create unit
// POST   /inventory/bulk          Bulk import units (CSV)
// GET    /inventory?propertyId=   Get all units for a property
// GET    /inventory/:unitId       Get single unit
// PATCH  /inventory/:id           Update unit
// DELETE /inventory/:id           Delete unit
// POST   /inventory/:id/reserve   Reserve unit
// POST   /inventory/:id/book      Book unit
// POST   /inventory/:id/release   Release unit (back to available)
// POST   /inventory/:id/sold      Mark unit as sold
// ════════════════════════════════════════════════════════════════════════════



router.post("/inventory", protectMulti, createInventory);
router.post("/inventory/bulk", protectMulti, bulkImportInventory);
router.get("/inventory", protectMulti, getInventoryByProperty);
router.get("/inventory/:unitId", protectMulti, getSingleInventory);
router.patch("/inventory/:id", protectMulti, updateInventory);
router.delete("/inventory/:id", protectMulti, deleteInventory);
router.post("/inventory/:id/reserve", protectMulti, reserveUnit);
router.post("/inventory/:id/book", protectMulti, bookUnit);
router.post("/inventory/:id/release", protectMulti, releaseUnit);
router.post("/inventory/:id/sold", protectMulti, markAsSold);

module.exports = router;