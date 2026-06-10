const mongoose = require("mongoose");

const PropertyDocumentSchema = new mongoose.Schema(
  {
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Properties",
      required: true,
    },
    developer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Developer",
      required: true,
    },

    // Document metadata
    title:    { type: String, required: true, trim: true },
    fileUrl:  { type: String, required: true },
    fileType: {
      type: String,
      enum: ["pdf", "image", "other"],
      default: "pdf",
    },
    documentCategory: {
      type: String,
      enum: [
        "brochure",
        "floor_plan",
        "payment_plan",
        "noc",
        "title_deed_template",
        "developer_profile",
        "other",
      ],
      required: true,
    },

    // Visibility flags
    isAgentVisible:  { type: Boolean, default: false }, // visible to agents in catalogue
    isPublic:        { type: Boolean, default: false }, // visible to registered customers on listing page

    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

PropertyDocumentSchema.index({ property: 1 });
PropertyDocumentSchema.index({ developer: 1 });
PropertyDocumentSchema.index({ documentCategory: 1 });
PropertyDocumentSchema.index({ isAgentVisible: 1 });
PropertyDocumentSchema.index({ isPublic: 1 });

module.exports = mongoose.model("PropertyDocument", PropertyDocumentSchema, "PropertyDocuments");
