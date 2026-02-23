const { Schema, model } = require('mongoose');

const cartItemSchema = new Schema({
product_type: { type: String, enum: ['ProductB2C', 'ProductB2B'], required: true },
  product: { type: Schema.Types.ObjectId, required: true, refPath: 'items.product_type' }, // Dynamic ref based on product_type
  quantity: { type: Number, required: true, min: 1 },
  price_per_unit: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR' },
  added_at: { type: Date, default: Date.now }
});

const cartSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  items: [cartItemSchema],
  total_amount: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: ['active', 'abandoned', 'converted'], default: 'active' }
}, {
  timestamps: true
});

cartSchema.pre('save', async function (next) {
  let total = 0;
  for (const item of this.items) {
    total += item.quantity * item.price_per_unit;
  }
  this.total_amount = total;
  next();
});

cartSchema.index({ user: 1 });
cartSchema.index({ 'items.product': 1 });

const Cart = model('Cart', cartSchema);

module.exports = Cart;