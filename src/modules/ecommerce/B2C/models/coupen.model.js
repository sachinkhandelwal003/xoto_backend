const { Schema, model } = require('mongoose');

const couponSchema = new Schema({
  code: { type: String, required: true, trim: true, unique: true },
  description: { type: String, trim: true },
  discount: {
    type: { type: String, enum: ['percentage', 'amount'], required: true },
    value: { type: Number, required: true, min: 0 },
    max_discount: { type: Number, min: 0 } // Optional cap for percentage discounts
  },
  applicable_to: {
    type: { type: String, enum: ['all', 'B2C', 'B2B', 'specific_products'], required: true },
    products: [{ type: Schema.Types.ObjectId, refPath: 'applicable_to.type' }], // Dynamic ref for specific products
    product_type: { type: String, enum: ['B2C', 'B2B'], required: function() { return this.applicable_to.type === 'specific_products'; } }
  },
  minimum_order_amount: { type: Number, min: 0, default: 0 },
  valid_from: { type: Date, required: true },
  valid_till: { type: Date, required: true },
  usage_limit: { type: Number, min: 0 }, // Total usage limit
  usage_per_user: { type: Number, min: 0, default: 1 }, // Limit per user
  used_count: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['active', 'inactive', 'expired'], default: 'active' }
}, {
  timestamps: true
});

couponSchema.pre('save', function (next) {
  const now = new Date();
  if (now > this.valid_till) {
    this.status = 'expired';
  } else if (this.usage_limit && this.used_count >= this.usage_limit) {
    this.status = 'inactive';
  }
  next();
});

couponSchema.index({ status: 1 });
couponSchema.index({ 'applicable_to.products': 1 });

const Coupon = model('Coupon', couponSchema);

module.exports = Coupon;