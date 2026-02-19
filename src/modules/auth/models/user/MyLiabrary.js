const mongoose = require("mongoose");

const customerAiLibrarySchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true
    },

    designType: {
      type: String,
      enum: ["landscaping", "interior"],
      default: "landscaping",
      required: true
    },

    images: [
      {
        type: String,
        required: true
      }
    ]
  },
  { timestamps: true }
);



module.exports = mongoose.model(
  "CustomerAiLibrary",
  customerAiLibrarySchema
);
