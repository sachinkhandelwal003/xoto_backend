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
    }
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
