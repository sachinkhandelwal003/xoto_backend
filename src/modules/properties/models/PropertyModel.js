const mongoose = require("mongoose");

const PropertySchema = new mongoose.Schema(
  {
    // =========================
    // BASIC INFO
    // =========================
    developer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Developer",
      required: false
    },

    propertyName: {
      type: String,
      required: false,
      trim: true,
      default: ""
    },

    description: {
      type: String,
      trim: true,
      required: false,
      default: ""
    },

    // =========================
    // PROPERTY TYPE
    // =========================
    transactionType: {
      type: String,
      enum: ["rent", "sell"],
      required: false,
      default: "rent"
    },
    propertySubType: {
      type: String,
      enum: ["off_plan", "ready", "resale"],
      required: false,
      default: "off_plan"
    },
    bedrooms: {
      type: Number,
      required: false,
      default: 0
    },

    bathrooms: {
      type: Number,
      required: false,
      default: 0
    },

    // =========================
    // DIMENSIONS
    // =========================
    length: {
      type: Number,
      required: false,
      default: 0
    },

    lengthUnit: {
      type: String,
      enum: ["ft", "m"],
      default: "ft",
      required: false
    },

    breadth: {
      type: Number,
      required: false,
      default: 0
    },

    breadthUnit: {
      type: String,
      enum: ["ft", "m"],
      default: "ft",
      required: false
    },

    builtUpArea_min: { // this is the min size
      type: Number,
      required: false,
      default: 0
    },

    builtUpArea_max: { // this is the max size
      type: Number,
      required: false,
      default: 0
    },

    builtUpAreaUnit: {
      type: String,
      enum: ["sqft", "sqm"],
      default: "sqft",
      required: false
    },

    // =========================
    // PRICE
    // =========================
    price: {
      type: Number,
      required: false,
      default: 0
    },

    currency: {
      type: String,
      default: "AED",
      required: false
    },

    // =========================
    // ADDRESS (FLAT)
    // =========================
    buildingNo: String,
    street: String,
    area: String,
    city: String,
    state: String, // Emirate
    country: {
      type: String,
      default: "UAE",
      required: false
    },
    postalCode: String,
    googleLocation: String,

    // =========================
    // MEDIA
    // =========================
    mainLogo: {
      type: String,
      default: "",
      required: false
    },

    photos: {
      type: [String],
      default: [],
      required: false
    },

    brochure: {
      type: String,
      default: "",
      required: false
    },

    // =========================
    // STATUS
    // =========================
    isAvailable: {
      type: Boolean,
      default: true,
      required: false
    },

    notReadyYet: {
      type: Boolean,
      default: false,
      required: false
    },
    isFeatured: {
      type: Boolean,
      default: false,
      required: false
    },

    // new fields we are adding 
    handover: {
      type: String,
      default: "",
      required: false
    },
    unitType: {
      type: [String],
      required: false,
      default: []
    },
    propertyType: {
      type: String,
      required: false,
      default: ""
    },
    description: {
      type: String,
      required: false,
      default: ""
    },
    downPayment: { // this will be in percentage
      type: Number,
      required: false,
      default: 0
    },
    paymentPlan_initialPercentage: {
      type: Number,
      required: false,
      default: 0
    },
    paymentPlan_laterPercentage: {
      type: Number,
      required: false,
      default: 0
    },
    price_min: {
      type: Number,
      required: false,
      default: 0
    },
    price_max: {
      type: Number,
      required: false,
      default: 0
    },
    amenities: {
      type: [String],
      default: [],
      required: false
    },
    location_highlights: {
      type: [String],
      default: [],
      required: false
    },
    about_developer: {
      type: String,
      default: "",
      required: false
    }
  },
  { timestamps: true }
);

const Property = mongoose.model("Property", PropertySchema, "Property");
module.exports = Property;


//Developer, Price,Main Logo , Property Name , No. of beds , No. of bathrooms , description , Length(with dimensions) , Breadth(with dimensions) , Address (House/Building No., Street, Area/Locality, City, State/Emirate, Country, Postal Code) , Properety Type(RENT/SELL) , PROPERTY SUB TYPE(OFF PLAN/READY/RESALE) , OTHER PHOTOS