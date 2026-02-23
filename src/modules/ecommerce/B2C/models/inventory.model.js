const { Schema } = require('mongoose');

const inventorySchema = new Schema({
  sku: { type: String, required: true, unique: true, trim: true }, // stock keeping unit
  product: { type: Schema.Types.ObjectId, ref: 'ProductB2C', required: true },

  warehouse: { type: String, trim: true, default: 'default' }, // support multiple warehouses

  quantity: { type: Number, required: true, default: 0, min: 0 }, // available stock
  reserved: { type: Number, default: 0, min: 0 },                 // reserved for pending orders
  low_stock_threshold: { type: Number, default: 5 },              // trigger alert when stock <= threshold

  batch_number: { type: String, trim: true },   // optional (for manufacturing/expiry tracking)
  expiry_date: { type: Date },                  // optional (useful for food/pharma)

  // Track movements (FIFO, adjustments, etc.)
  movements: [
    {
      type: { type: String, enum: ['in', 'out', 'adjustment'], required: true },
      quantity: { type: Number, required: true },
      note: { type: String, trim: true },
      date: { type: Date, default: Date.now }
    }
  ],

  updated_at: { type: Date, default: Date.now }
});

// Index for fast lookups
inventorySchema.index({ sku: 1 });
inventorySchema.index({ product: 1 });
inventorySchema.index({ warehouse: 1 });

module.exports = inventorySchema;
