const mongoose = require("mongoose");

const UnitTemplateSchema = new mongoose.Schema(
  {
    // =========================
    // RELATIONSHIPS
    // =========================
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Properties",
      required: true
    },
    
    developerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Developers",
      required: true
    },

    // =========================
    // TEMPLATE INFO
    // =========================
    templateName: {
      type: String,
      required: true,
      trim: true
    },
    
    templateCode: {
      type: String,
      required: true,
      trim: true
    },

    // =========================
    // UNIT DETAILS
    // =========================
    unitType: {
      type: String,
      enum: [
        "apartment", "villa", "townhouse", "duplex", "penthouse",
        "plot", "office", "retail", "warehouse", "hotel_apartment"
      ],
      required: true
    },
    
    bedroomType: {
      type: String,
      enum: ["studio", "1bed", "2bed", "3bed", "4bed", "5bed", "6bed", "7bed", "8plus"]
    },
    
    bedrooms: {
      type: Number,
      default: 0
    },
    
    bathrooms: {
      type: Number,
      default: 0
    },

    // =========================
    // DIMENSIONS
    // =========================
    area: {
      type: Number,
      required: true
    },
    
    areaUnit: {
      type: String,
      enum: ["sqft", "sqm"],
      default: "sqft"
    },

    // =========================
    // PRICING
    // =========================
    startingPrice: {
      type: Number,
      required: true
    },
    
    pricePerSqft: {
      type: Number
    },
    
    currency: {
      type: String,
      default: "AED"
    },

    // =========================
    // FEATURES
    // =========================
    hasView: {
      type: Boolean,
      default: false
    },
    
    viewType: {
      type: [String],
      enum: ["sea", "city", "garden", "landmark", "pool", "park"],
      default: []
    },
    
    parkingSpaces: {
      type: Number,
      default: 0
    },
    
    furnishing: {
      type: String,
      enum: ["furnished", "semi_furnished", "unfurnished"],
      default: "unfurnished"
    },

    // =========================
    // EXTRA FIELDS (TEMPLATE-SPECIFIC)
    // =========================
    extraFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    // =========================
    // STATUS
    // =========================
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

// Indexes
UnitTemplateSchema.index({ propertyId: 1 });
UnitTemplateSchema.index({ developerId: 1 });
UnitTemplateSchema.index({ templateCode: 1 }, { unique: true });
UnitTemplateSchema.index({ propertyId: 1, isActive: 1 });

// Prevent overwrite error
const UnitTemplate = mongoose.models.UnitTemplate || 
                   mongoose.model("UnitTemplate", UnitTemplateSchema, "UnitTemplates");

module.exports = UnitTemplate;
