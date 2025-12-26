const mongoose = require("mongoose");

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

    // Enable / Disable question
    isActive: {
      type: Boolean,
      default: true
    },

    questionType: {
      type: String,
      default: "text",
      enum: ["text", "yesorno", "options", "number"],
      required: false
    },
    minValue: {
      type: Number,
      default: 0,
      required: false
    },
    maxValue: {
      type: Number,
      default: 0,
      required: false
    },
  },
  { timestamps: true }
);


const TypeQuestion =
  mongoose.models.EstimateTypeQuestion ||
  mongoose.model("EstimateTypeQuestion", TypeQuestionSchema);

module.exports = TypeQuestion;
