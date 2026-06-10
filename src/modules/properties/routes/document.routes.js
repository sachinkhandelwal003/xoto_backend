const express = require("express");
const {
  uploadDocument,
  getDocumentsByProperty,
  updateDocument,
  deleteDocument,
} = require("../controllers/document.controller");
const { protect } = require("../../../middleware/auth");

const router = express.Router();

// Upload a document for a property
router.post("/", protect, uploadDocument);

// Get all documents for a property (role-filtered)
router.get("/:propertyId", protect, getDocumentsByProperty);

// Update document metadata / visibility
router.patch("/:docId", protect, updateDocument);

// Soft-delete a document
router.delete("/:docId", protect, deleteDocument);

module.exports = router;
