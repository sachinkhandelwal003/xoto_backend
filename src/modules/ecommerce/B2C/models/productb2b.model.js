const { Schema, model } = require('mongoose');

const documentSchema = new Schema({
  type: { type: String, trim: true },
  path: { type: String, trim: true },
  verified: { type: Boolean, default: false },
  reason: { type: String, trim: true },
  suggestion: { type: String, trim: true },
  uploaded_at: { type: Date, default: Date.now }
});

const documentsSchema = new Schema({
  product_invoice: { type: documentSchema },
  product_certificate: { type: documentSchema },
  quality_report: { type: documentSchema }
}, { _id: false });

const imageSchema = new Schema({
  url: { type: String, trim: true, required: true },
  position: { type: Number, required: true, min: 1, max: 5 },
  alt_text: { type: String, trim: true },
  is_primary: { type: Boolean, default: false },
  uploaded_at: { type: Date, default: Date.now },
  verified: { type: Boolean, default: false },
  reason: { type: String, trim: true },
  suggestion: { type: String, trim: true }
});

const threeDModelSchema = new Schema({
  url: { type: String, trim: true, required: true },
  format: { type: String, enum: ['glb', 'gltf', 'obj', 'fbx'], required: true },
  alt_text: { type: String, trim: true },
  uploaded_at: { type: Date, default: Date.now },
  verified: { type: Boolean, default: false },
  reason: { type: String, trim: true },
  suggestion: { type: String, trim: true }
});

const productB2BSchema = new Schema({
  vendor: { type: Schema.Types.ObjectId, ref: 'VendorB2B', required: true },
  category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
  brand: { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
  material: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
  attributes: [{ type: Schema.Types.ObjectId, ref: 'Attribute' }],
  tags: [{ type: Schema.Types.ObjectId, ref: 'Tag' }],
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  short_description: { type: String, trim: true, maxlength: 200 },
  product_code: { type: String, trim: true, unique: true },
  pricing: {
    bulk_pricing: [{
      min_quantity: { type: Number, required: true, min: 1 },
      price_per_unit: { type: Number, required: true, min: 0 },
      currency: { type: String, default: 'INR' }
    }],
    cost_price: { type: Number, min: 0 },
    currency: { type: String, default: 'INR' },
    discount: {
      percentage: { type: Number, min: 0, max: 100 },
      amount: { type: Number, min: 0 },
      valid_till: { type: Date }
    },
    tax: {
      rate: { type: Number, min: 0, max: 100 },
      type: { type: String, default: 'GST' },
      inclusive: { type: Boolean, default: true }
    }
  },
  documents: { type: documentsSchema, default: {} },
  images: [imageSchema],
  three_d_model: { type: threeDModelSchema },
  shipping: {
    weight: { type: String, trim: true },
    dimensions: {
      length: { type: String, trim: true },
      width: { type: String, trim: true },
      height: { type: String, trim: true }
    },
    free_shipping: { type: Boolean, default: false }
  },
  minimum_order_quantity: { type: Number, min: 1, default: 1 },
  status: {
    type: String,
    enum: ['draft', 'pending_verification', 'active', 'rejected', 'inactive', 'archived'],
    default: 'draft'
  },
  verification_status: {
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'draft'], default: 'pending' },
    verified_by: { type: Schema.Types.ObjectId, ref: 'User' },
    verified_at: { type: Date },
    rejection_reason: { type: String, trim: true },
    suggestion: { type: String, trim: true }
  },
  seo: {
    meta_title: { type: String, trim: true, maxlength: 60 },
    meta_description: { type: String, trim: true, maxlength: 160 },
    keywords: [{ type: String, trim: true }]
  }
}, {
  timestamps: true
});

productB2BSchema.index({ name: 'text', short_description: 'text', description: 'text' });
productB2BSchema.index({ vendor: 1 });
productB2BSchema.index({ category: 1 });
productB2BSchema.index({ brand: 1 });
productB2BSchema.index({ tags: 1 });
productB2BSchema.index({ 'verification_status.status': 1 });

const ProductB2B = model('ProductB2B', productB2BSchema);

module.exports = ProductB2B;