const { Schema, model } = require('mongoose');

const wishlistItemSchema = new Schema({
  product_type: { type: String, enum: ['B2C', 'B2B'], required: true },
  product: { type: Schema.Types.ObjectId, required: true, refPath: 'items.product_type' },
  added_at: { type: Date, default: Date.now }
});

const wishlistSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  items: [wishlistItemSchema]
}, {
  timestamps: true
});

wishlistSchema.index({ user: 1 });
wishlistSchema.index({ 'items.product': 1 });

const Wishlist = model('Wishlist', wishlistSchema);

module.exports = Wishlist;