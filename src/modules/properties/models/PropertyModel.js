const mongoose = require("mongoose");

const PropertySchema = new mongoose.Schema(
{
  // =========================
  // PROJECT DETAILS (PDF STEP 1)
  // =========================
  projectType: {
    type: String,
    enum: ["existing", "new"],
    required: true
  },

  projectName: {
    type: String,
    trim: true,
    required: true
  },

  developerName: {
    type: String,
    trim: true,
    required: true
  },

  location: {
    type: String,
    required: true
  },

  // =========================
  // PROPERTY INFO
  // =========================
  unitType: {
    type: String,
    enum: ["Apartment", "Villa", "Townhouse", "Duplex", "Penthouse"],
    required: true
  },

  bedrooms: {
    type: String,
    enum: ["Studio", "1", "2", "3", "4", "5", "6", "7", "8+"],
    required: true
  },

  price: {
    type: Number,
    required: true
  },

  area: {
    type: Number,
    required: true
  },

  description: {
    type: String,
    default: ""
  },

  photos: {
    type: [String],
    required: true
  },

  // =========================
  // COMMISSION (PDF IMPORTANT)
  // =========================
  shareCommission: {
    type: Boolean,
    required: true
  },

  commission: {
    type: Number,
    default: 0
  },

  // =========================
  // LOCATION DETAILS
  // =========================
  buildingNo: String,
  street: String,
  areaName: String,
  city: String,
  state: String,
  country: {
    type: String,
    default: "UAE"
  },
  googleLocation: String,

  // =========================
  // STATUS FLOW (PDF STEP 2 & 3)
  // =========================
  approvalStatus: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },

  rejectionReason: {
    type: String,
    default: ""
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  listingType: {
  type: String,
  enum: ["developer", "secondary"],
  required: true
},
developer: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Developer",   // matches Developer model
  default: null
},
},
{ timestamps: true }
);

module.exports = mongoose.model("Property", PropertySchema);