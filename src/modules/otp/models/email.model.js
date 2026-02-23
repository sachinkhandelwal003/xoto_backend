const mongoose = require('mongoose');

const EmailSettingsSchema = new mongoose.Schema(
  {
    host: {
      type: String,
      required: [true, 'SMTP Host is required'],
      trim: true
    },

    port: {
      type: Number,
      required: [true, 'SMTP Port is required']
    },

    secure: {
      type: Boolean,
      default: true
    },

    authUser: {
      type: String,
      required: [true, 'SMTP Username is required'],
      trim: true
    },

    authPass: {
      type: String,
      required: [true, 'SMTP Password is required'],
      select: false // 🔒 never return password by default
    },

    fromName: {
      type: String,
      default: ''
    },

    fromEmail: {
      type: String,
      required: [true, 'From Email is required'],
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/,
        'Please add a valid email address'
      ]
    },

    isActive: {
      type: Boolean,
      default: true
    },

    lastTestedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('EmailSettings', EmailSettingsSchema);
