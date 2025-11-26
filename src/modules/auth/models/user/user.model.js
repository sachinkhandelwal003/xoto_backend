// models/user/user.model.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      first_name: { type: String, trim: true, required: true, minlength: 2, maxlength: 50 },
      last_name: { type: String, trim: true, required: true, minlength: 2, maxlength: 50 },
    },
  // models/user/user.model.js
email: {
  type: String,
  trim: true,
  lowercase: true,
  unique: true,
  required: true,
  // Strong & standard regex (covers 99.9% real emails)
  match: [/^[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}$/, 'Please enter a valid email address'],
},
    mobile: {
      type: String,
      required: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
    },
    isActive: { type: Boolean, default: true },
    is_deleted: { type: Boolean, default: false },
    deleted_at: { type: Date },
  },
  { timestamps: true }
);

// Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ mobile: 1, role: 1 }); // Allows same mobile for different roles
userSchema.index({ role: 1 });

// Only enforce email uniqueness at DB level
userSchema.pre('save', async function (next) {
  if (this.isNew || this.isModified('email')) {
    const existing = await this.constructor.findOne({
      email: this.email,
      _id: { $ne: this._id },
      is_deleted: false,
    });
    if (existing) return next(new Error('Email already in use'));
  }
  next();
});

module.exports = mongoose.model('Allusers', userSchema);