const mongoose = require('mongoose');

const TypeSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const SubcategorySchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    types: [TypeSchema],
  },
  { timestamps: true }
);

const CategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      enum: ['Interior', 'Landscaping'],
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    subcategories: [SubcategorySchema],
  },
  { timestamps: true }
);

// Auto generate slug
CategorySchema.pre('save', function (next) {
  if (this.isModified('name') || !this.slug) {
    this.slug = this.name.toLowerCase().replace(/\s+/g, '-');
  }
  next();
});

module.exports = mongoose.model('EstimateMasterCategory', CategorySchema);