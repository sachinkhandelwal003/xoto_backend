const express = require("express");
const multer = require("multer");
const auth = require("../../../middleware/auth");
// Path check kar lena: Ek folder piche ja kar Controllers/VirtualStagingController
const stagingController = require("../Controllers/VirtualController");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// POST Route
router.post(
  "/process-staging",
  auth.protectCustomer,
  upload.array("image", 1),
  stagingController.processVirtualStaging // <-- Ye function exist karna chahiye
);

// GET Route
router.get(
  "/get-staging-library",
  auth.protectCustomer,
  stagingController.getStagingLibrary // <-- Ye function exist karna chahiye
);

module.exports = router;