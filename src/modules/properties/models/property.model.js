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
    // PROJECT INFO (PRD §9.3 Step 1)
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
      trim:     true,
    },
    projectName: { type: String, default: "" }, // alias for propertyName
    developerName: {
      type:    String,
      default: "",
    },
    locality: { type: String, default: "" },
    propertyType: {
      type: String,
      enum: ["Residential", "Commercial", "Mixed-Use"],
      default: "Residential",
    },
    overview: { type: String, default: "" },

    // ══════════════════════════════════════════════════════════════
    // UNIT DETAILS
    // ══════════════════════════════════════════════════════════════
    unitNumber:  { type: String, default: "" },
    floorNumber: { type: Number, default: 0 },

    unitType: {
      type: String,
      enum: ["apartment", "villa", "townhouse", "duplex", "penthouse", "plot", "office", "retail", "warehouse"],
      required: function () {
        return this.propertySubType !== "off_plan";
      },
    },
    unitTypes: {
      type: [String],
      enum: ["apartment", "villa", "townhouse", "duplex", "penthouse", "plot", "office", "retail", "warehouse"],
      default: []
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
    priceRange: {
      from: { type: Number, default: 0 },
      to: { type: Number, default: 0 },
    },
    currency:  { type: String, default: "AED" },

    // ══════════════════════════════════════════════════════════════
    // LOCATION
    // ══════════════════════════════════════════════════════════════
    area: {
      type:     String,
      trim:     true,
    },
    city:    { type: String, default: "Dubai" },
    country: { type: String, default: "UAE" },
    coordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    location: {
      address: { type: String, default: "" },
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
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
    media: {
      mainLogo: { type: String, default: "" },
      architectureImages: [{ type: String }],
      interiorImages: [{ type: String }],
      lobbyImages: [{ type: String }],
      otherImages: [{ type: String }],
      youtubeVideos: [{ type: String }],
    },
    videoUrl: { type: String, default: "" },
    brochure: { type: String, default: "" },
    youtubeVideos: [{ type: String }],

    // ══════════════════════════════════════════════════════════════
    // DESCRIPTION
    // ══════════════════════════════════════════════════════════════
    description: { type: String, default: "" },

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
    // BUILDINGS (PRD §9.3 Step 2)
    // ══════════════════════════════════════════════════════════════
    buildings: [
      {
        title: { type: String },
        image: { type: String },
        description: { type: String },
      }
    ],

    // ══════════════════════════════════════════════════════════════
    // FLOOR PLANS (PRD §9.3 Step 2)
    // ══════════════════════════════════════════════════════════════
    floorPlans: [
      {
        unitType: { type: String },
        areaFrom: { type: Number },
        areaTo: { type: Number },
      }
    ],

    // ══════════════════════════════════════════════════════════════
    // INVENTORY (PRD §9.3 Step 3)
    // ══════════════════════════════════════════════════════════════
    inventory: [
      {
        unitType: { type: String },
        units: { type: Number },
        sqft: { type: Number },
        sqm: { type: Number },
      }
    ],
    parkingAllocation: { type: String, default: "" },

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
    furnishingStatus: {
      type: String,
      enum: ["Unfurnished", "Semi-Furnished", "Fully Furnished"],
      default: "Unfurnished"
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
    developmentStatus: {
      type: String,
      enum: ["Planned", "Under Construction", "Completed"],
      default: "Planned"
    },
    floors:            { type: Number, default: 0 },
    numberOfFloors:    { type: Number, default: 0 },
    serviceChargeInfo: { type: String, default: "" },
    serviceCharge:     { type: String, default: "" },
    readinessProgress: { type: String, default: "0%" },
    constructionProgress: { type: Number, default: 0 },

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
    // SALE STATUS
    // ══════════════════════════════════════════════════════════════
    saleStatus: {
      type: String,
      enum: ["Available", "Reserved", "Sold"],
      default: "Available"
    },

    // ══════════════════════════════════════════════════════════════
    // DEVELOPER DETAILS
    // ══════════════════════════════════════════════════════════════
    developerDetails: {
      companyName: { type: String },
      contactName: { type: String },
      email: { type: String },
      phone: { type: String },
      logo: { type: String },
    },

    // ══════════════════════════════════════════════════════════════
    // STATUS & APPROVAL (PRD §12.1)
    // ══════════════════════════════════════════════════════════════
    approvalStatus: {
      type:    String,
      enum:    ["pending", "approved", "rejected", "changes_requested", "draft"],
      default: "pending",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "draft"],
      default: "draft"
    },
    listingStatus: {
      type:    String,
      enum:    ["pending", "active", "rejected", "inactive", "changes_requested"],
      default: "pending",
    },
    rejectionReason: { type: String, default: "" },
    adminComments:   { type: String, default: "" },
    adminNotes:      { type: String, default: "" },
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
    // INVENTORY CATEGORY (MAIN DRIVER FOR INVENTORY LOGIC)
    // ══════════════════════════════════════════════════════════════
    inventoryCategory: {
      type: String,
      enum: [
        "residential_tower",
        "villa_community",
        "townhouse_cluster",
        "commercial_office",
        "commercial_retail",
        "warehouse",
        "land_plot",
        "hotel_apartment"
      ],
      default: "residential_tower"
    },
    
    // ══════════════════════════════════════════════════════════════
    // FLOOR & BUILDING CONFIGURATIONS (FOR AUTO-INVENTORY)
    // ══════════════════════════════════════════════════════════════
    buildingNames: { type: [String], default: [] },
    floorConfigurations: [
      {
        buildingName: { type: String, default: "" },
        floorNumber: { type: Number, required: true },
        units: [
          {
            unitType: {
              type: String,
              enum: ["apartment", "villa", "townhouse", "duplex", "penthouse", "plot", "office", "retail", "warehouse"],
              required: true
            },
            bedroomType: {
              type: String,
              enum: ["studio", "1bed", "2bed", "3bed", "4bed", "5bed", "6bed", "7bed", "8plus"],
              required: true
            },
            bedrooms: { type: Number, default: 0 },
            bathrooms: { type: Number, default: 0 },
            area: { type: Number, required: true },
            areaUnit: { type: String, enum: ["sqft", "sqm"], default: "sqft" },
            price: { type: Number, required: true },
            count: { type: Number, default: 1 },
            hasView: { type: Boolean, default: false },
            viewType: {
              type: [String],
              enum: ["sea", "city", "garden", "landmark", "pool", "park"],
              default: []
            },
            parkingSpaces: { type: Number, default: 0 },
            furnishing: {
              type: String,
              enum: ["furnished", "semi_furnished", "unfurnished"],
              default: "unfurnished"
            }
          }
        ]
      }
    ],

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

PropertySchema.index({ developer: 1 });
PropertySchema.index({ createdByAdmin: 1 });
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