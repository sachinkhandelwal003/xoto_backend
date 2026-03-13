const mongoose = require("mongoose");

const PropertyInventorySchema = new mongoose.Schema(
{
  developerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Developer",
    required: true
  },

  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    required: true
  },

  unitId: {
    type: String,
    required: true
  },

  tower: {
    type: String
  },

  floor: {
    type: Number
  },

  unitType: {
    type: String
  },

  bedrooms: {
    type: Number
  },

  bathrooms: {
    type: Number
  },

  area: {
    type: Number
  },

  price: {
    type: Number
  },

  facing: {
    type: String
  },

  view: {
    type: String
  },

  status: {
    type: String,
    enum: ["Available","Reserved","Booked","Sold"],
    default: "Available"
  },

  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Agent"
  },

  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Lead"
  },

  reservedAt: {
    type: Date
  },

  bookedAt: {
    type: Date
  },

  soldAt: {
    type: Date
  }

},
{ timestamps:true }
)

PropertyInventorySchema.index(
  { projectId: 1, unitId: 1 },
  { unique: true }
);

const PropertyInventory = mongoose.model(
  "PropertyInventory",
  PropertyInventorySchema,
  "PropertyInventories"
);

module.exports = PropertyInventory;