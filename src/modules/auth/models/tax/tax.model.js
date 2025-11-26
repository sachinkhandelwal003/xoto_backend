// modules/tax/models/tax.model.js
const mongoose = require('mongoose');

const TaxSchema = new mongoose.Schema({
  taxName: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    match: /^[a-zA-Z0-9\s\-&]+$/,
  },
  rate: {
    type: Number,
    required: true,
    min: [0, 'Tax rate cannot be negative'],
    max: [100, 'Tax rate cannot exceed 100%'],
  },
  status: {
    type: Number,
    enum: [0, 1], // 0: inactive, 1: active
    default: 1,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

TaxSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Tax', TaxSchema);