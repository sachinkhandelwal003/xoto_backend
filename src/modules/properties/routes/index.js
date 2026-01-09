const Router = require("express");
const {createDeveloper,createProperty,getAllProperties,deleteProperty,editProperty,getPropertiesById} = require("../controllers/index.js")
const router = Router();

router.post("/create-developer",createDeveloper)
router.post("/create-properties",createProperty)
router.post("/delete-property",deleteProperty)
router.post("/edit-property",editProperty)
router.get("/get-all-properties",getAllProperties)
router.get("/get-property-by-id",getPropertiesById)

module.exports = router ; 