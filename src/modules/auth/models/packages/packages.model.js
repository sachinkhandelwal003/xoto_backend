// modules/package/models/package.model.js
const mongoose = require('mongoose');

const LandscapingPackageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    enum: ['Essentials', 'Premium', 'Luxe', 'Tshibare'], // Only these allowed
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
 currency: {
  type: String,
  default: 'AED',
  enum: ['USD', 'EUR', 'ZAR', 'AED'], // Added AED
},

  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  features: [
    {
      type: String,
      trim: true,
    },
  ],
  isActive: {
    type: Boolean,
    default: true,
  },
  popular: {
    type: Boolean,
    default: false,
  },
  order: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

// Auto-generate slug from name
LandscapingPackageSchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = this.name.toLowerCase().replace(/\s+/g, '-');
  }
  next();
});

module.exports = mongoose.model('LandscapingPackage', LandscapingPackageSchema);