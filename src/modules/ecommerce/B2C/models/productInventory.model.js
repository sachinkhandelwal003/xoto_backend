const { Schema, model } = require('mongoose');

/**
 * Inventory Schema
 */
const inventorySchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: 'ProductB2C', required: true },
  sku: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0 },
  reserved: { type: Number, default: 0, min: 0 },
  low_stock_threshold: { type: Number, default: 5, min: 0 },
  low_stock: { type: Boolean, default: false }, // auto-updated
  warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },

  movements: [{
    type: { type: String, enum: ['initial', 'in', 'out', 'adjustment'], required: true },
    quantity: { type: Number, required: true },
    note: { type: String, trim: true },
    date: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true // createdAt and updatedAt
});

// ✅ Compound index: product + sku + warehouse must be unique
inventorySchema.index({ product: 1, sku: 1, warehouse: 1 }, { unique: true });

// ✅ Virtual for available stock
inventorySchema.virtual('available').get(function () {
  return this.quantity - this.reserved;
});

// ✅ Pre-save hook: auto-update low_stock
inventorySchema.pre('save', function (next) {
  this.low_stock = this.quantity <= this.low_stock_threshold;
  next();
});

/**
 * Model
 */
const Inventory = model('Inventory', inventorySchema);

module.exports = Inventory;
