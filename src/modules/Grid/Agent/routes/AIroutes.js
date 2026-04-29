const express = require("express");

const {
  translateText,
  improveDescription
} = require("../controllers/AIController.js");

// const { protectMulti } = require("../../../middleware/auth"); // Agar authentication lagani ho baad mein

const router = express.Router();

// Sab routes protect karne ho toh isko uncomment kar lena
// router.use(protectMulti);

// AI Features Routes
router.post("/translate", translateText);
router.post("/improve-description", improveDescription);

module.exports = router;