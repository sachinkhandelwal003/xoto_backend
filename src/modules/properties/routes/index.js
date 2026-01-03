const Router = require("express");
const {createDeveloper,createProperty} = require("../controllers/index.js")
const router = Router();

router.post("/create-developer",createDeveloper)
router.post("/create-properties",createProperty)

module.exports = router ; 