const mongoose = require("mongoose");

const TypeQuestionOptionSchema = new mongoose.Schema(
  {
    question: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EstimateTypeQuestion",
      required: true
    },

    title: {
      type: String,
      required: true,
      trim: true
    },

    order: {
      type: Number,
      default: 0
    },

    isActive: {
      type: Boolean,
      default: true
    },
    valueType:{
      type:String,
      default:"percentage",
      enum:['percentage','fixedValue'],
      required:false
    },
    value:{
      type:Number,
      default:0,
      required:false
    }
  },
  { timestamps: true }
);

const TypeQuestionOption =
  mongoose.models.EstimateTypeQuestionOption ||
  mongoose.model("EstimateTypeQuestionOption", TypeQuestionOptionSchema);

module.exports = TypeQuestionOption;