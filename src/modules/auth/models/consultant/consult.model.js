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
  mobile_number: {
    type: String
  },
  email: {
    type: String,
    lowercase: true
  },
  message: {
    type: String
  },
  is_active: { type: Boolean, default: true },

  // Soft Delete
  is_deleted: { type: Boolean, default: false },
  deleted_at: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Consultant', consultant_schema);
