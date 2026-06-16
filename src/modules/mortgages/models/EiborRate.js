const mongoose = require("mongoose");

const EiborRateSchema = new mongoose.Schema(
  {
    lastUpdatedDate: {
      type: String,
      required: true,
      trim: true
    },
    overnight: {
      type: Number,
      required: true
    },
    oneWeek: {
      type: Number,
      required: true
    },
    oneMonth: {
      type: Number,
      required: true
    },
    threeMonths: {
      type: Number,
      required: true
    },
    sixMonths: {
      type: Number,
      required: true
    },
    oneYear: {
      type: Number,
      required: true
    },
    fetchedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    collection: "eibor_rates"
  }
);

module.exports = mongoose.model("EiborRate", EiborRateSchema);
