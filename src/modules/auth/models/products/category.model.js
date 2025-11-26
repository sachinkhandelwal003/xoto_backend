const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  }
}, {
  timestamps: true
});

const subcategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product_category',
    required: true
  }
}, {
  timestamps: true
});

const Category = mongoose.model('Product_category', categorySchema);
const Subcategory = mongoose.model('Product_subcategory', subcategorySchema);

module.exports = { Category, Subcategory };