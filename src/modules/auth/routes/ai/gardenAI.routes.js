const express = require("express");
const multer = require("multer");
const router = express.Router();
const { protectCustomer, authorize } = require('../../../../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error("Only JPEG, PNG, WebP allowed"));
  }
});

const {
  generateGardenDesigns
} = require("../../controllers/ai/gardenAI.controller");

router.post(
  "/generate-garden",
  upload.any(),
  (req, res, next) => {
    if (req.files?.length) {
      req.files.gardenImage = req.files;
    }
    next();
  },
  protectCustomer,
  generateGardenDesigns
);

// router.use(protectCustomer);

router.post(
  "/get-all-ai-images",
protectCustomer,
  generateGardenDesigns
);


module.exports = router;
