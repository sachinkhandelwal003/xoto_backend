// modules/auth/models/role/role.model.js
const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 50
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: 300
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

const RoleSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 50
  },
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 50
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Platform',
    required: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: 300
  },
  parentRole: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    default: null
  },
  level: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },
  isSuperAdmin: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

const Role = mongoose.model("Role", RoleSchema);
const Platform = mongoose.model("Platform", CategorySchema);

module.exports = { Role, Platform };