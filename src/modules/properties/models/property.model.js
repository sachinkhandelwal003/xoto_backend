// property.model.js

const mongoose = require("mongoose");

const PropertySchema = new mongoose.Schema(
  {

    developer: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "Developer",
      default: null,
    },
    createdByAdmin: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,
    },

    // ══════════════════════════════════════════════════════════════
    // PROPERTY TYPE (PRD §1.6)
    // ══════════════════════════════════════════════════════════════
    propertySubType: {
      type:     String,
      enum:     ["off_plan", "secondary", "rental", "commercial"],
      required: true,
      default:  "off_plan",
    },
    transactionType: {
      type:    String,
      enum:    ["rent", "sell"],
      default: "sell",
    },
isFeatured: { type: Boolean, default: false },
isHot:      { type: Boolean, default: false },
    // ══════════════════════════════════════════════════════════════
    // PROJECT INFO
    // ══════════════════════════════════════════════════════════════
    projectOption: {
      type:    String,
      enum:    ["existing", "new"],
      default: "new",
    },
    existingProjectId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "Property",
      default: null,
    },
    propertyName: {
      type:     String,
      required: true,
      trim:     true,
    },
    developerName: {
      type:    String,
      default: "",
    },

    // ══════════════════════════════════════════════════════════════
    // UNIT DETAILS
    // ══════════════════════════════════════════════════════════════
    unitNumber:  { type: String, default: "" },
    floorNumber: { type: Number, default: 0 },

    unitType: {
      type: String,
      enum: [
        "apartment", "villa", "townhouse", "duplex", "penthouse",
        "plot", "office", "retail", "warehouse",
      ],
      required: function () {
        return this.propertySubType !== "off_plan";
      },
    },
    bedroomType: {
      type:    String,
      enum:    ["studio", "1bed", "2bed", "3bed", "4bed", "5bed", "6bed", "7bed", "8plus"],
      default: "1bed",
    },
    bedrooms:  { type: Number, default: 0 },
    bathrooms: { type: Number, default: 0 },

    // ══════════════════════════════════════════════════════════════
    // DIMENSIONS
    // ══════════════════════════════════════════════════════════════
    builtUpArea:     { type: Number, default: 0 },
    builtUpArea_min: { type: Number, default: 0 },
    builtUpArea_max: { type: Number, default: 0 },
    builtUpAreaUnit: { type: String, enum: ["sqft", "sqm"], default: "sqft" },

    // ══════════════════════════════════════════════════════════════
    // PRICE
    // ══════════════════════════════════════════════════════════════
    price:     { type: Number, default: 0 },
    price_min: { type: Number, default: 0 },
    price_max: { type: Number, default: 0 },
    currency:  { type: String, default: "AED" },

    // ══════════════════════════════════════════════════════════════
    // LOCATION
    // ══════════════════════════════════════════════════════════════
    area: {
      type:     String,
      required: function () { return this.propertySubType !== "off_plan"; },
    },
    city:    { type: String, default: "Dubai" },
    country: { type: String, default: "UAE" },
    coordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    proximity: {
      airport: { type: String, default: "" },
      metro:   { type: String, default: "" },
      mall:    { type: String, default: "" },
      school:  { type: String, default: "" },
    },

    // ══════════════════════════════════════════════════════════════
    // MEDIA
    // ══════════════════════════════════════════════════════════════
    mainLogo: { type: String, default: "" },
    photos: {
      architecture: [{ type: String }],
      interior:     [{ type: String }],
      lobby:        [{ type: String }],
      other:        [{ type: String }],
    },
    videoUrl: { type: String, default: "" },
    brochure: { type: String, default: "" },

    // ══════════════════════════════════════════════════════════════
    // DESCRIPTION
    // ══════════════════════════════════════════════════════════════
    description: { type: String, required: true, trim: true },

    // ══════════════════════════════════════════════════════════════
    // AMENITIES & FACILITIES (PRD §9.3 Step 2)
    // ══════════════════════════════════════════════════════════════
    amenities: { type: [String], default: [] },
    facilities: {
      swimmingPool:     { type: Boolean, default: false },
      gym:              { type: Boolean, default: false },
      parking:          { type: Boolean, default: false },
      childrenPlayArea: { type: Boolean, default: false },
      gardens:          { type: Boolean, default: false },
      security:         { type: Boolean, default: false },
      concierge:        { type: Boolean, default: false },
      lounge:           { type: Boolean, default: false },
      smartHome:        { type: Boolean, default: false },
    },

    // ══════════════════════════════════════════════════════════════
    // FEATURES
    // ══════════════════════════════════════════════════════════════
    hasView:       { type: Boolean, default: false },
    viewType: {
      type:    [String],
      enum:    ["sea", "city", "garden", "landmark", "pool", "park"],
      default: [],
    },
    parkingSpaces: { type: Number, default: 0 },
    furnishing: {
      type:    String,
      enum:    ["furnished", "semi_furnished", "unfurnished"],
      default: "unfurnished",
    },
    ownershipType: {
      type:    String,
      enum:    ["freehold", "leasehold"],
      default: "freehold",
    },
    availableFrom: { type: Date, default: null },

    // ══════════════════════════════════════════════════════════════
    // RENTAL SPECIFIC (PRD §1.6)
    // ══════════════════════════════════════════════════════════════
    rentalFrequency: {
      type:    String,
      enum:    ["monthly", "quarterly", "yearly"],
      default: null,
      required: function () { return this.propertySubType === "rental"; },
    },
    minimumContract: { type: Number, default: null }, // months
    isImmediate:     { type: Boolean, default: false },
    cheques:         { type: Number, default: null },  // number of cheques landlord accepts
    isShortTerm:     { type: Boolean, default: false }, // PRD §1.6 short-term and long-term

    // ══════════════════════════════════════════════════════════════
    // COMPLIANCE (PRD §14.4)
    // ══════════════════════════════════════════════════════════════
    reraPermitNumber: {
      type:    String,
      trim:    true,
      default: null,
      required: function () { return this.propertySubType === "rental"; },
    },
    dldRegistrationNumber: {
      type:    String,
      trim:    true,
      default: null,
    },

    // ══════════════════════════════════════════════════════════════
    // OFF-PLAN SPECIFIC (PRD §9.3)
    // ══════════════════════════════════════════════════════════════
    totalUnits: { type: Number, default: 0 },
    completionDate: {
      quarter:  { type: String, enum: ["Q1", "Q2", "Q3", "Q4"], default: null },
      year:     { type: Number, default: null },
      fullDate: { type: Date,   default: null },
    },
    projectStatus: {
      type:    String,
      enum:    ["presale", "under_construction", "ready", "sold_out"],
      default: "presale",
    },
    floors:            { type: Number, default: 0 },
    serviceChargeInfo: { type: String, default: "" },
    readinessProgress: { type: String, default: "0%" },

    paymentPlan: [{
      title: { type: String },
      stages: [{
        stage: {
          type: String,
          enum: ["on_booking", "during_construction", "upon_handover", "other"],
        },
        percentage:  { type: Number },
        description: { type: String },
      }],
    }],

    eoiAmount:        { type: Number, default: 0 },
    resaleConditions: { type: String, default: "" },

    // ══════════════════════════════════════════════════════════════
    // COMMISSION
    // ══════════════════════════════════════════════════════════════
    commission:                { type: Number, default: 0 },
    shareCommission:           { type: Boolean, default: false },
    shareCommissionPercentage: { type: Number, default: 0 },

    // ══════════════════════════════════════════════════════════════
    // STATUS & APPROVAL (PRD §12.1)
    // ══════════════════════════════════════════════════════════════
    approvalStatus: {
      type:    String,
      enum:    ["pending", "approved", "rejected"],
      default: "pending",
    },
    listingStatus: {
      type:    String,
      enum:    ["pending", "active", "rejected", "inactive"],
      default: "pending",
    },
    rejectionReason: { type: String, default: "" },
    approvedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,
    },
    approvedAt:              { type: Date, default: null },
    isAvailable:             { type: Boolean, default: true },
    isFeatured:              { type: Boolean, default: false },
    showContactOnlyVerified: { type: Boolean, default: true },

    // ══════════════════════════════════════════════════════════════
    // STATISTICS (PRD §9.4, §9.6)
    // ══════════════════════════════════════════════════════════════
    totalInventory: { type: Number, default: 0 },
    soldUnits:      { type: Number, default: 0 },
    reservedUnits:  { type: Number, default: 0 },
    bookedUnits:    { type: Number, default: 0 },
    viewCount:      { type: Number, default: 0 }, // listing page views
    wishlistCount:  { type: Number, default: 0 }, // times saved by customers
  },
  { timestamps: true }
);

// ══════════════════════════════════════════════════════════════════════════
// INDEXES
// ══════════════════════════════════════════════════════════════════════════

PropertySchema.index({ developer:       1 });
PropertySchema.index({ createdByAdmin:  1 });
PropertySchema.index({ propertySubType: 1 });
PropertySchema.index({ approvalStatus:  1 });
PropertySchema.index({ listingStatus:   1 });
PropertySchema.index({ area:            1 });
PropertySchema.index({ city:            1 });
PropertySchema.index({ price:           1 });
PropertySchema.index({ isFeatured:      1 });
PropertySchema.index({ rentalFrequency: 1 });
PropertySchema.index({ reraPermitNumber: 1 }, { sparse: true });

// Most common catalogue query
PropertySchema.index({ approvalStatus: 1, listingStatus: 1, propertySubType: 1 });

// Text search
PropertySchema.index({ propertyName: "text", description: "text", area: "text" });

module.exports = mongoose.model("Properties", PropertySchema, "Properties");