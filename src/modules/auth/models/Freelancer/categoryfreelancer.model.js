// models/category.js
const mongoose = require('mongoose');

const category_schema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
    unique: true,
  },
  slug: {
    type: String,
    unique: true,
    trim: true
  },
  description: { type: String, trim: true },
  icon: { type: String, trim: true },
  is_active: { type: Boolean, default: true },

  // Soft Delete
  is_deleted: { type: Boolean, default: false },
  deleted_at: { type: Date }
}, { timestamps: true });

// Auto-generate slug
category_schema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = this.name.toLowerCase();
  }
  next();
});

// Soft-delete queries
category_schema.pre(['find', 'findOne', 'findOneAndUpdate', 'countDocuments'], function () {
  // If query already filters is_deleted, do NOT override it
  if (!('is_deleted' in this.getQuery())) {
    this.where({ is_deleted: false });
  }
});


category_schema.index({ slug: 1 });
category_schema.index({ is_active: 1 });
category_schema.index({ is_deleted: 1 });

module.exports = mongoose.model('Category_freelancer', category_schema);