const express = require("express");
const {
    createDocument,
    getAllDocuments,
    getGlobalDocuments,
    getDocumentsByBankId,
    getDocumentById,
    getDocumentByKey,
    updateDocument,
    deleteDocument,
    restoreDocument,
    getRequiredDocuments,
    downloadTemplate,
    viewSampleDocument,updateDocumentStatus
} = require("../controllers/DocumentLiabraryMortgage.controller");

const { protect } = require("../../../middleware/auth");

const router = express.Router();

/**
 * =========================================
 * IMPORTANT: SPECIFIC ROUTES MUST COME FIRST
 * THEN PARAMETERIZED ROUTES
 * =========================================
 */
router.get("/", getAllDocuments);

// =========================================
// 1. SPECIFIC STATIC ROUTES (No parameters)
// =========================================

// Get required documents dynamically
router.get("/required", getRequiredDocuments);

// Get global documents
router.get("/global", getGlobalDocuments);

// Get all documents with filters

// =========================================
// 2. ROUTES WITH STATIC PREFIXES
// =========================================

// Get documents by bank ID
router.get("/bank/:bankId", getDocumentsByBankId);

// Get document by key (key is a string, not ObjectId)
router.get("/key/:key", getDocumentByKey);

// =========================================
// 3. ACTION ROUTES (Specific actions on document)
// =========================================

// Download template (must come before /:id)
router.get("/download-template/:id", downloadTemplate);

// View sample document (must come before /:id)
router.get("/view-sample/:id", viewSampleDocument);

// =========================================
// 4. PARAMETERIZED ROUTES (/:id - MUST BE LAST)
// =========================================

// Get document by ID
router.get("/:id", getDocumentById);

// =========================================
// 5. ADMIN ROUTES
// =========================================

router.post("/", protect, createDocument);
router.put("/:id", protect, updateDocument);
router.delete("/:id", protect, deleteDocument);
router.post("/:id/restore", protect, restoreDocument);
router.put("/status/:id", protect, updateDocumentStatus);


module.exports = router;