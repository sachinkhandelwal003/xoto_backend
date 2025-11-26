const { Schema, model } = require('mongoose');

const categorySchema = new Schema({
  name: { type: String, required: true, trim: true, unique: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null },

  metaTitle: { type: String, trim: true },
  metaDescription: { type: String, trim: true, maxlength: 160 },
  metaKeywords: [{ type: String, trim: true }],

  isHighlighted: { type: Boolean, default: false },
  isSpecial: { type: Boolean, default: false },
  showInFilterMenu: { type: Boolean, default: true },
  // sortOrder REMOVED

  icon: { type: String, trim: true },
  image: { type: String, trim: true },

  deletedAt: { type: Date },
  status: { type: Number, default: 1 },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

categorySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

categorySchema.virtual('isDeleted').get(function() {
  return this.status === 0 && this.deletedAt !== null;
});

categorySchema.index({ parent: 1, status: 1, deletedAt: 1 });

module.exports = model('Category', categorySchema);