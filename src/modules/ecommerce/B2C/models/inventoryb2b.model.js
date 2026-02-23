const { Schema, model } = require('mongoose');

const inventoryB2BSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: 'ProductB2B', required: true },
  sku: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0 },
  reserved: { type: Number, default: 0, min: 0 },
  low_stock_threshold: { type: Number, default: 5, min: 0 },
  low_stock: { type: Boolean, default: false },
  warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  movements: [{
    type: { type: String, enum: ['initial', 'in', 'out', 'adjustment'], required: true },
    quantity: { type: Number, required: true },
    note: { type: String, trim: true },
    date: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

inventoryB2BSchema.index({ product: 1, sku: 1, warehouse: 1 }, { unique: true });

inventoryB2BSchema.virtual('available').get(function () {
  return this.quantity - this.reserved;
});

inventoryB2BSchema.pre('save', function (next) {
  this.low_stock = this.quantity <= this.low_stock_threshold;
  next();
});

const InventoryB2B = model('InventoryB2B', inventoryB2BSchema);

module.exports = InventoryB2B;