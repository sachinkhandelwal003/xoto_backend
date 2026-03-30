const mongoose = require('mongoose');

const aiGeneratedImageSchema = new mongoose.Schema(
  {
    imageUrl: {
      type: String,
      required: true,
      trim: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true
    },
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

    // ✅ NEW FIELDS - Generation Details
    originalImageUrl: {
      type: String,
      trim: true,
      default: null
    },
    styleName: {
      type: String,
      trim: true,
      default: null
    },
    elements: {
      type: [String],
      default: []
    },
    description: {
      type: String,
      trim: true,
      default: null
    },
    roomType: {
      type: String,
      trim: true,
      default: null  // sirf interior ke liye
    },
    prompt: {
      type: String,
      trim: true,
      default: null
    },
    summary: {
      type: String,
      trim: true,
      default: null
    }
  },
  {
    timestamps: true
  }
);

aiGeneratedImageSchema.index({ userId: 1, createdAt: -1 });

let AiGeneratedImage = mongoose.model('AiGeneratedImage', aiGeneratedImageSchema);
module.exports = AiGeneratedImage;