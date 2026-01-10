const Router = require("express");
const { createBrand,getAllBrands } = require("../controllers/index.js")
const router = Router();

router.post("/create-brand", createBrand)
router.get("/get-all-brand", getAllBrands)
// router.post("/create-properties", createProperty)
// router.post("/delete-property", deleteProperty)
// router.post("/edit-property", editProperty)
// router.get("/get-all-properties", getAllProperties)
// router.get("/get-property-by-id", getPropertiesById)
// router.get("/marketplace", MarketPlaceAPI)
// router.get("/get-all-developers", getAllDevelopers)
// router.post("/delete-developer-by-id", deleteDeveloper)
// router.get("/get-developer-by-id", getDeveloperrById)
// router.get("/get-property-by-id", getPropertyById)
// router.post("/edit-developer", editDeveloper)

module.exports = router; 