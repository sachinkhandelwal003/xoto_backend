const mongoose = require("mongoose");

const PropertyInventorySchema = new mongoose.Schema(
  {
    developerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Developer",
      required: true,
      index: true
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true
    },
    unitId: {
      type: String,
      required: true,
      trim: true
    },
    area: {
      type: Number,
      required: true
    },
    price: {
      type: Number,
      required: true
    },
    view: {
      type: String,
      default: ""
    },
    status: {
      type: String,
      enum: ["Available", "Booked", "Blocked", "Sold"],
      default: "Available"
    }
  },
  { timestamps: true }
);

PropertyInventorySchema.index({ projectId: 1, unitId: 1 }, { unique: true });

const PropertyInventory = mongoose.model(
  "PropertyInventory",
  PropertyInventorySchema,
  "PropertyInventories"
);

module.exports = PropertyInventory;