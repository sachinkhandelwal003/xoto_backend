const express = require("express");
const multer = require("multer");

// ✅ AUTH MIDDLEWARE
const auth = require("../../../middleware/auth");

// ✅ CONTROLLER
const skyController = require("../../ImageEnhancer/Controllers/SkyController");

const router = express.Router();


const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB Limit
  }
});



// ✅ REPLACE SKY (POST)
router.post(
  "/replace-sky",
  auth.protectCustomer, 
  upload.array("image", 1),
  skyController.replaceSky
);

// ✅ GET SKY LIBRARY
router.get(
  "/get-sky-library",
  auth.protectCustomer,
  skyController.getSkyLibrary
);

// ✅ TEST ROUTE
router.get("/test", (req, res) => {
  res.json({
    status: true,
    message: "Sky Replacement Routes Working",
    controllerFunctions: Object.keys(skyController)
  });
});

// Tere app.js ke setup ke liye .default export
module.exports = router;