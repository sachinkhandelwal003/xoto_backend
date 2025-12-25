const mongoose = require("mongoose");


const OptionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    }
  },
  { timestamps: false }
);


const TypeQuestionSchema = new mongoose.Schema(
  {

    type: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EstimateMasterType",
      required: true
    },

    // Actual question text
    question: {
      type: String,
      required: true,
      trim: true
    },

    // Selectable options
    options: {
      type: [OptionSchema],
      default: []
    },

    // Enable / Disable question
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);


const TypeQuestion =
  mongoose.models.EstimateTypeQuestion ||
  mongoose.model("EstimateTypeQuestion", TypeQuestionSchema);

module.exports = TypeQuestion;
