const mongoose = require('mongoose');

const consultant_schema = new mongoose.Schema({
  name: {
    first_name: { 
      type: String
    },
    last_name: { 
      type: String
    }
  },
  mobile: {
  country_code: {
    type: String,
    required: true,
    trim: true,
    default: '+91',
  },
  number: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^\d{8,15}$/.test(v);
      },
    }
  }
},
  email: {
    type: String,
    lowercase: true
  },
    status: { type: Number, default: 0, enum: ["submit","contacted"] }, // 0=Pending, 1=Approved, 2=Rejected

  message: {
    type: String
  },
  is_active: { type: Boolean, default: true },

  // Soft Delete
  is_deleted: { type: Boolean, default: false },
  deleted_at: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Consultant', consultant_schema);
