const mongoose = require('mongoose');

const subcategory_schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, trim: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category_freelancer', required: true },
  description: { type: String, trim: true },
  icon: { type: String, trim: true },
  is_active: { type: Boolean, default: true },

  // Soft Delete
  is_deleted: { type: Boolean, default: false },
  deleted_at: { type: Date }
}, { timestamps: true });

// Auto slug
subcategory_schema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  next();
});

// Smart soft-delete filter
subcategory_schema.pre(['find', 'findOne', 'findOneAndUpdate', 'countDocuments'], function () {
  if (!('is_deleted' in this.getQuery())) {
    this.where({ is_deleted: false });
  }
});

subcategory_schema.index({ category: 1 });
subcategory_schema.index({ slug: 1 });
subcategory_schema.index({ is_deleted: 1 });

module.exports = mongoose.model('Subcategory_freelancer', subcategory_schema);
