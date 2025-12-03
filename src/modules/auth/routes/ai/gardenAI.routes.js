const express = require("express");
const multer = require("multer");
const router = express.Router();

// Accept ANY file field named: gardenImage, gardenImage[], or GardenImage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, WebP allowed"));
    }
  }
});

const { generateGardenDesigns } = require("../../controllers/ai/gardenAI.controller");

// THIS LINE FIXES EVERYTHING
router.post(
  "/generate-garden",
  upload.any(), // Accept ANY file + any field name
  (req, res, next) => {
    // Force correct field name so controller always works
    if (req.files && req.files.length > 0) {
      req.files.gardenImage = req.files; // Force it
    }
    next();
  },
  generateGardenDesigns
);

module.exports = router;