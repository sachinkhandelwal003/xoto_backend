// backend/models/user/EnhancementImage.js
const mongoose = require('mongoose');

const enhancementImageSchema = new mongoose.Schema({
  imageUrl: {
    type: String,
    required: true
  },
  originalImage: {
    type: String,
    required: false
  },
  userType: {
    type: String,
    enum: ['customer', 'guest'],
    default: 'customer'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  designType: {
    type: String,
    default: 'enhancement'
  },
  // Enhancement details as per frontend
  enhancementDetails: {
    brightness: { type: Number, default: 100 },
    contrast: { type: Number, default: 100 },
    saturation: { type: Number, default: 100 },
    sharpness: { type: Number, default: 100 },
    preset: { 
      type: String, 
      enum: ['auto', 'lowlight', 'clarity', 'superres', 'none'], 
      default: 'none' 
    },
    removeBackground: { type: Boolean, default: false },
    removeWatermark: { type: Boolean, default: false }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('EnhancementImage', enhancementImageSchema);