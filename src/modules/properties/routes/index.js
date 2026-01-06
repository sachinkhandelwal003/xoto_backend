const Router = require("express");
const {createDeveloper,createProperty,getAllProperties} = require("../controllers/index.js")
const router = Router();

router.post("/create-developer",createDeveloper)
router.post("/create-properties",createProperty)
router.get("/get-all-properties",getAllProperties)

module.exports = router ; 