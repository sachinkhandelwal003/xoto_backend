// models/Freelancer/accountant.model.js
const mongoose = require('mongoose');

const accountantSchema = new mongoose.Schema(
  {
    // Basic Info
    name: {
      first_name: { type: String, trim: true, required: true },
      last_name: { type: String, trim: true, required: true },
    },
    email: { type: String, trim: true, lowercase: true, unique: true, required: true },
    mobile: { type: String, unique: true, required: true },

    // Auth
    password: { type: String, select: false, required: true },

    // Profile
    bio: { type: String, maxlength: 1000 },
    experience_years: { type: Number, min: 0, max: 50 },
    qualifications: [String],
    firm_name: String,
    gst_number: String,

    // Role
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },

    // Address
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: 'India' },
    },

    // Active Status
    isActive: { type: Boolean, default: true },

    // Soft Delete
    is_deleted: { type: Boolean, default: false },
    deleted_at: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Accountant', accountantSchema);