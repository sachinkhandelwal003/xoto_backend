const Router = require("express");
const {createDeveloper,createProperty,getAllProperties,deleteProperty,editProperty,getPropertiesById,MarketPlaceAPI,getAllDevelopers,deleteDeveloper} = require("../controllers/index.js")
const router = Router();

router.post("/create-developer",createDeveloper)
router.post("/create-properties",createProperty)
router.post("/delete-property",deleteProperty)
router.post("/edit-property",editProperty)
router.get("/get-all-properties",getAllProperties)
router.get("/get-property-by-id",getPropertiesById)
router.get("/marketplace",MarketPlaceAPI)
router.get("/get-all-developers",getAllDevelopers)
router.post("/delete-developer-by-id",deleteDeveloper)

module.exports = router ; 