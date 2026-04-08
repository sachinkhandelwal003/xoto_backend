const express = require("express");
const multer = require("multer");
const router = express.Router();

const { protectCustomer } = require('../../../../middleware/auth');

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
  generateGardenDesigns,
  generateInteriorDesigns,
  getInteriorDesigns,
  getgardenDesigns,
  addCustomerDesign,
  getCustomerDesigns

} = require("../../controllers/ai/gardenAI.controller");

// ✅ Yeh line change karo (sabse important)
const aiChatModule = require("../../../ai/routes/ai.routes");
const AIchatRoutes = aiChatModule.default || aiChatModule;

router.post("/generate-garden", upload.any(), protectCustomer, generateGardenDesigns);

router.post("/post-customer-liabrary", protectCustomer, addCustomerDesign);
router.get("/get-customer-liabrary", protectCustomer, getCustomerDesigns);

router.get("/get-interior-designs", protectCustomer, getInteriorDesigns);
router.get("/get-landscape-designs", protectCustomer, getgardenDesigns);

router.post("/generate-interior", upload.any(), protectCustomer, generateInteriorDesigns);


// Chat sub-router
router.use("/chat", AIchatRoutes);

module.exports = router;