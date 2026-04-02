const mongoose = require('mongoose');

const aiGeneratedImageSchema = new mongoose.Schema(
  {
    // ── Generated image (output) ─────────────────────────────────────────────
    imageUrl: {
      type: String,
      required: true,
      trim: true,
    },

    // ── Source image user uploaded / selected ────────────────────────────────
    inputImageUrl: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Who generated ────────────────────────────────────────────────────────
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },

    userType: {
      type: String,
      enum: ['customer'],
      default: 'customer',
      required: true,
    },

    // ── Design type ──────────────────────────────────────────────────────────
    designType: {
      type: String,
      enum: ['landscaping', 'interior'],
      default: 'interior',
      required: true,
    },

    // ── Interior Planner fields ──────────────────────────────────────────────

    // Room type selected (e.g. "living", "bedroom", "kitchen")
    roomType: {
      type: String,
      enum: ['living', 'bedroom', 'kitchen', 'bathroom', 'dining', 'office'],
      default: null,
    },

    // Style selected (e.g. "modern", "scandinavian", "bohemian")
    styleName: {
      type: String,
      trim: true,
      default: null, 
    },

    // Elements selected (array — e.g. ["sofa", "rug", "plants"])
    elements: {
      type: [String],
      default: [],
    },

    // Custom instruction / specific requirement from user
    description: {
      type: String,
      trim: true,
      default: null,
    },

    // AI response message
    aiMessage: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index — latest designs per user fast fetch
aiGeneratedImageSchema.index({ userId: 1, createdAt: -1 });
aiGeneratedImageSchema.index({ userId: 1, designType: 1, createdAt: -1 });

const AiGeneratedImage = mongoose.model('AiGeneratedImage', aiGeneratedImageSchema);
module.exports = AiGeneratedImage;