const PropertyDocument = require("../models/property.document.model");
const Property = require("../models/property.model");

const isAdmin = (role) => {
  if (!role) return false;
  if (typeof role === "object") {
    return role?.isSuperAdmin === true || Number(role?.code) === 0 || Number(role?.code) === 1;
  }
  return role === "xoto_super_admin" || role === "xoto_staff_admin";
};

const isDevRole = (role) => {
  if (!role) return false;
  if (typeof role === "object") return Number(role?.code) === 17;
  return role === "developer";
};

const isAgent = (role) => {
  if (!role) return false;
  if (typeof role === "object") return Number(role?.code) === 16 || Number(role?.code) === 18;
  const n = String(role).toLowerCase();
  return ["gridadvisor", "grid_advisor", "agent"].includes(n);
};

// ════════════════════════════════════════════════════════════
// UPLOAD DOCUMENT
// POST /property-documents
// ════════════════════════════════════════════════════════════
exports.uploadDocument = async (req, res) => {
  try {
    const { role, _id: userId } = req.user;

    if (!isAdmin(role) && !isDevRole(role)) {
      return res.status(403).json({ status: "fail", message: "Only Admin or Developer can upload documents" });
    }

    const { propertyId, title, fileUrl, fileType, documentCategory, isAgentVisible, isPublic } = req.body;

    if (!propertyId || !title || !fileUrl || !documentCategory) {
      return res.status(400).json({
        status: "fail",
        message: "propertyId, title, fileUrl, and documentCategory are required",
      });
    }

    // Verify property exists and developer owns it
    let propertyQuery = { _id: propertyId };
    if (isDevRole(role)) propertyQuery.developer = userId;

    const property = await Property.findOne(propertyQuery);
    if (!property) {
      return res.status(404).json({ status: "fail", message: "Property not found or access denied" });
    }

    const developerId = isDevRole(role) ? userId : property.developer;

    const doc = await PropertyDocument.create({
      property: propertyId,
      developer: developerId,
      title,
      fileUrl,
      fileType: fileType || "pdf",
      documentCategory,
      isAgentVisible: isAgentVisible === true || isAgentVisible === "true",
      isPublic: isPublic === true || isPublic === "true",
    });

    return res.status(201).json({ status: "success", data: doc });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// ════════════════════════════════════════════════════════════
// GET DOCUMENTS FOR A PROPERTY
// GET /property-documents/:propertyId
// ════════════════════════════════════════════════════════════
exports.getDocumentsByProperty = async (req, res) => {
  try {
    const { role, _id: userId } = req.user;
    const { propertyId } = req.params;

    let filter = { property: propertyId, isDeleted: false };

    if (isAgent(role)) {
      // Agents see only agent-visible docs
      filter.isAgentVisible = true;
    } else if (!isAdmin(role) && !isDevRole(role)) {
      // Customers see only public docs
      filter.isPublic = true;
    } else if (isDevRole(role)) {
      // Developer sees only their own property docs
      const property = await Property.findOne({ _id: propertyId, developer: userId });
      if (!property) {
        return res.status(403).json({ status: "fail", message: "Access denied" });
      }
    }
    // Admin sees everything

    const docs = await PropertyDocument.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({ status: "success", count: docs.length, data: docs });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// ════════════════════════════════════════════════════════════
// UPDATE DOCUMENT (visibility flags / title)
// PATCH /property-documents/:docId
// ════════════════════════════════════════════════════════════
exports.updateDocument = async (req, res) => {
  try {
    const { role, _id: userId } = req.user;

    if (!isAdmin(role) && !isDevRole(role)) {
      return res.status(403).json({ status: "fail", message: "Not authorised" });
    }

    let query = { _id: req.params.docId, isDeleted: false };
    if (isDevRole(role)) query.developer = userId;

    const doc = await PropertyDocument.findOne(query);
    if (!doc) {
      return res.status(404).json({ status: "fail", message: "Document not found or access denied" });
    }

    const allowedFields = ["title", "isAgentVisible", "isPublic", "documentCategory"];
    allowedFields.forEach((f) => {
      if (req.body[f] !== undefined) doc[f] = req.body[f];
    });

    await doc.save();

    return res.status(200).json({ status: "success", data: doc });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// ════════════════════════════════════════════════════════════
// DELETE DOCUMENT (soft delete)
// DELETE /property-documents/:docId
// ════════════════════════════════════════════════════════════
exports.deleteDocument = async (req, res) => {
  try {
    const { role, _id: userId } = req.user;

    if (!isAdmin(role) && !isDevRole(role)) {
      return res.status(403).json({ status: "fail", message: "Not authorised" });
    }

    let query = { _id: req.params.docId, isDeleted: false };
    if (isDevRole(role)) query.developer = userId;

    const doc = await PropertyDocument.findOneAndUpdate(
      query,
      { isDeleted: true },
      { new: true }
    );

    if (!doc) {
      return res.status(404).json({ status: "fail", message: "Document not found or access denied" });
    }

    return res.status(200).json({ status: "success", message: "Document deleted" });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};
