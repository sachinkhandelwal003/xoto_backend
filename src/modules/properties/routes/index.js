const Router = require("express");
const { 
  createDeveloper,
//   agentSignup,
  createProperty,
  loginDeveloper,
  getAllProperties,
  deleteProperty,
  getPropertyById,
  getDeveloperrById,
  editProperty,
  editDeveloper,
  getPropertiesById,
  MarketPlaceAPI,
  getAllDevelopers,
  deleteDeveloper,
  createInventory,
//  addInventory,  
 bulkImportInventory,
  getInventoryByProperty,
  updateInventory,
  deleteInventory,
  getDeveloperLeads,
  approveProperty,
  getApprovedProperties,     

} = require("../controllers/index.js");
const router = Router();

router.post("/create-developer", createDeveloper)
router.post("/login-developer", loginDeveloper)
router.post("/signup-developer", createDeveloper)
router.post("/create-properties", createProperty)
router.post("/delete-property", deleteProperty)
router.post("/edit-property", editProperty)
router.get("/get-all-properties", getAllProperties)
router.get("/get-property-by-id", getPropertiesById)
router.get("/marketplace", MarketPlaceAPI)
router.get("/get-all-developers", getAllDevelopers)
router.post("/delete-developer-by-id", deleteDeveloper)
router.get("/get-developer-by-id", getDeveloperrById)
router.get("/get-property-by-id", getPropertyById)
router.post("/edit-developer", editDeveloper)
router.post("/create-inventory", createInventory);
router.get("/get-inventory-by-property", getInventoryByProperty);
// router.post("/create-inventory", addInventory);
router.put("/update-inventory/:id", updateInventory);
// router.post("/update-inventory", updateInventory);
router.delete("/delete-inventory/:id", deleteInventory);
router.post("/bulk-import-inventory", bulkImportInventory);
router.get("/developer-leads", getDeveloperLeads);
router.put("/approve/:id", approveProperty);
router.get("/approved", getApprovedProperties);
router.get("/developer-leads/:id", verifyToken, getDeveloperLeadById);

// router.post("/agent-signup", agentSignup)



module.exports = router; 