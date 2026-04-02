const mongoose = require('mongoose');

const aiGeneratedImageSchema = new mongoose.Schema(
  {
    // AI generated image URL
    imageUrl: {
      type: String,
      required: true,
      trim: true
    },

    // Who generated this image
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true
    },

    // User type (fixed to customer, extensible later)
    userType: {
      type: String,
      enum: ['customer'],
      default: 'customer',
      required: true
    },

    designType: {
      type: String,
      default: "landscaping",
      enum: ["landscaping", "interior"],
      required: false
    },

    // :white_check_mark: ADD THIS (description)
    description: {
      type: String,
      trim: true,
      default: ""
    },

    // :white_check_mark: OPTIONAL: store selected style/elements if needed
    styleName: {
      type: String,
      trim: true,
      default: ""
    },

    elements: [
      {
        type: String,
        trim: true
      }
    ]

  },
  {
    timestamps: true
  }
);

aiGeneratedImageSchema.index({ userId: 1, createdAt: -1 });

let AiGeneratedImage = mongoose.model(
  'AiGeneratedImage',
  aiGeneratedImageSchema
);

module.exports = AiGeneratedImage;