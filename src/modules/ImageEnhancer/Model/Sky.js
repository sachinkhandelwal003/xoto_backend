const mongoose = require('mongoose');

const skyReplacementSchema = new mongoose.Schema({
  imageUrl: {
    type: String, // Processed image path
    required: true
  },
  originalImage: {
    type: String, // Original image path
    required: true
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
    default: 'sky_replacement'
  },
  // Sky Replacement specific options
  skyDetails: {
    skyType: { 
      type: String, 
      enum: ['blue', 'dark'], 
      required: true 
    },
    intensity: { 
      type: Number, 
      default: 100 
    }
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('SkyReplacement', skyReplacementSchema);