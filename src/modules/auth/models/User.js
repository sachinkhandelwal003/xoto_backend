const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    select: false
  },
  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: true
  },
   status: {
    type: Number,
    enum: [0, 1], // 0 = inactive, 1 = active
    default: 1
  },
  platformFreePercentageCommission: {  // Better naming convention
    type: Number,  // lowercase 'n'
    default: 2,     // Default 2% as we discussed
    min: 0,
    max: 100
},
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', UserSchema);