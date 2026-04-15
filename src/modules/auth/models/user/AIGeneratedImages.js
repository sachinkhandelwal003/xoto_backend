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

    status: {
      type: String,
      enum: ["processing", "completed", "failed"],
      default: "processing"
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

    description: {
      type: String,
      trim: true,
      default: ""
    },

    styleName: {
      type: String,
      trim: true,
      default: ""
    },

    elements: {
      type: [String],
      default: []
    },

    // ✅ YE DO NAYI FIELDS ADD KI HAIN
    isPremium: {
      type: Boolean,
      default: false
    },

    roomType: {
      type: String,
      trim: true,
      default: ""
    }

  },
  {
    timestamps: true
  }
);

aiGeneratedImageSchema.index({ userId: 1, createdAt: -1 });

const AiGeneratedImage = mongoose.model(
  'AiGeneratedImage',
  aiGeneratedImageSchema
);

module.exports = AiGeneratedImage;