const express = require("express");
const {
  uploadDocument,
  getDocumentsByProperty,
  updateDocument,
  deleteDocument,
} = require("../controllers/document.controller");
const { protectMulti } = require("../../../middleware/auth");

const router = express.Router();

// Upload a document for a property
router.post("/", protectMulti, uploadDocument);

// Get all documents for a property (role-filtered)
router.get("/:propertyId", protectMulti, getDocumentsByProperty);

// Update document metadata / visibility
router.patch("/:docId", protectMulti, updateDocument);

// Soft-delete a document
router.delete("/:docId", protectMulti, deleteDocument);

module.exports = router;
