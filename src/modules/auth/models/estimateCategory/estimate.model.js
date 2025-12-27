const mongoose = require("mongoose");

const EstimateSchema = new mongoose.Schema(
  {
    type: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EstimateMasterType",
      required: true
    },

    // Customer info (keep flexible)
    customer: {
      name: String,
      email: String,
      phone: String,
      location:String,
      propertyType:String
    },

    // Area (copied from areaQuestion answer)
    area: {
      type: Number,
      required: true
    },

    // Final calculated total
    totalAmount: {
      type: Number,
      default: 0
    },

    currency: {
      type: String,
      default: "AED"
    },

    status: {
      type: String,
      enum: ["draft", "submitted", "final"],
      default: "submitted"
    }
  },
  { timestamps: true }
);

const Estimate = mongoose.model("Estimate", EstimateSchema);
module.exports = Estimate;