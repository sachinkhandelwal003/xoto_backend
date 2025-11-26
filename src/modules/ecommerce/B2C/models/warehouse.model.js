const { Schema, model } = require('mongoose');

/**
 * Warehouse Schema
 */
const warehouseSchema = new Schema({
  vendor: { type: Schema.Types.ObjectId, ref: 'VendorB2C', required: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  code: { type: String, required: true, trim: true, unique: true },
  address: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  country: { type: String, trim: true, default: 'India' },
  contact_person: { type: String, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true, match: [/^\S+@\S+\.\S+$/, 'Invalid email format'] },
  capacity_units: { type: Number, default: 0, min: 0 },
  active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Indexes
warehouseSchema.index({ vendor: 1 });
warehouseSchema.index({ city: 1, state: 1 });
warehouseSchema.index({ vendor: 1, name: 1 }, { unique: true });

// Pre-save middleware to update updated_at
warehouseSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

const Warehouse = model('Warehouse', warehouseSchema);

module.exports = Warehouse;