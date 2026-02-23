const { Schema, model } = require('mongoose');

const orderItemSchema = new Schema({
  product_type: { type: String, enum: ['B2C', 'B2B'], required: true },
  product: { type: Schema.Types.ObjectId, required: true, refPath: 'items.product_type' },
  quantity: { type: Number, required: true, min: 1 },
  price_per_unit: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR' },
  discount_applied: {
    percentage: { type: Number, min: 0, max: 100 },
    amount: { type: Number, min: 0 }
  }
});

const orderSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  order_number: { type: String, required: true, unique: true },
  items: [orderItemSchema],
  total_amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR' },
  shipping: {
    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      country: { type: String, trim: true },
      postal_code: { type: String, trim: true }
    },
    cost: { type: Number, min: 0, default: 0 },
    free_shipping: { type: Boolean, default: false }
  },
  payment: {
    method: { type: String, enum: ['credit_card', 'debit_card', 'net_banking', 'upi', 'cod'], required: true },
    status: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
    transaction_id: { type: String, trim: true }
  },
  coupon: { type: Schema.Types.ObjectId, ref: 'Coupon' },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
    default: 'pending'
  },
  ordered_at: { type: Date, default: Date.now }
}, {
  timestamps: true
});

orderSchema.pre('save', async function (next) {
  let total = 0;
  for (const item of this.items) {
    const itemTotal = item.quantity * item.price_per_unit;
    const discount = item.discount_applied?.amount || (itemTotal * (item.discount_applied?.percentage || 0) / 100);
    total += itemTotal - (discount || 0);
  }
  total += this.shipping.cost || 0;
  this.total_amount = total;
  next();
});

orderSchema.index({ user: 1 });
orderSchema.index({ 'items.product': 1 });
orderSchema.index({ status: 1 });

const Order = model('Order', orderSchema);

module.exports = Order;