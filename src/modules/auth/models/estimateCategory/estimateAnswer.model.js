const mongoose = require("mongoose");

const EstimateAnswerSchema = new mongoose.Schema(
  {
    estimate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Estimate",
      required: true
    },

    question: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EstimateTypeQuestion",
      required: true
    },

    // SNAPSHOT (never changes)
    questionText: {
      type: String,
      required: true
    },

    questionType: {
      type: String,
      enum: ["text", "yesorno", "options", "number"],
      required: true
    },

    // For number / text
    answerValue: {
      type: mongoose.Schema.Types.Mixed
    },

    // For options
    selectedOption: {
      optionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "EstimateTypeQuestionOption"
      },
      title: String,
      value: Number,
      valueSubType: {
        type: String,
        enum: ["persqm", "flat"]
      }
    },

    // Calculation result for this question
    calculatedAmount: {
      type: Number,
      default: 0
    },

    includeInEstimate: {
      type: Boolean,
      default: true
    },

    areaQuestion: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

const EstimateAnswer= mongoose.model("EstimateAnswer", EstimateAnswerSchema);
module.exports = EstimateAnswer ;
