const mongoose = require('mongoose');

const CurrencySchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    uppercase: true,
    match: /^[A-Z]{3}$/, // ISO 4217 standard (e.g., USD, EUR)
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  symbol: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  exchangeRate: {
    type: Number,
    required: true,
    min: [0, 'Exchange rate cannot be negative'],
  },
  isDefault: {
    type: Boolean,
    default: false,
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

// Pre-save hook to ensure only one currency is default and update timestamp
CurrencySchema.pre('save', async function (next) {
  this.updatedAt = Date.now();

  if (this.isDefault) {
    await mongoose.model('Currency').updateMany({ _id: { $ne: this._id } }, { isDefault: false });
  }

  next();
});

module.exports = mongoose.model('Currency', CurrencySchema);