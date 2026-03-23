const mongoose = require('mongoose');
const { Schema } = mongoose;

const inventorySchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: 'ProductB2C', required: true },
  sku: { type: String, required: true },
  quantity: { type: Number, required: true, default: 0, min: 0 },
  reserved: { type: Number, default: 0, min: 0 },
  low_stock_threshold: { type: Number, default: 5, min: 0 },
  low_stock: { type: Boolean, default: false },

  movements: [{
    type: { type: String, enum: ['initial', 'in', 'out', 'adjustment'], required: true },
    quantity: { type: Number, required: true },
    note: { type: String, trim: true },
    date: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

// ✅ unique per product + sku only (no warehouse)
inventorySchema.index({ product: 1, sku: 1 }, { unique: true });

inventorySchema.virtual('available').get(function () {
  return this.quantity - this.reserved;
});

inventorySchema.pre('save', function (next) {
  this.low_stock = this.quantity <= this.low_stock_threshold;
  next();
});

const Inventory = mongoose.models.Inventory || mongoose.model('Inventory', inventorySchema);
module.exports = Inventory;