const mongoose = require('mongoose');

const FreelancerRequestSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
    unique: true,
  },
  skills: [
    {
      type: String,
      trim: true,
      required: true,
    },
  ],
  hourlyRate: {
    type: Number,
    min: 0,
    default: 0,
  },
  portfolio: {
    type: String,
    trim: true,
  },
  status: {
    type: Number,
    enum: [0, 1, 2], // 0 = pending, 1 = approved, 2 = rejected
    default: 0,
  },
  approvedAt: {
    type: Date,
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Assuming admins are also stored in the Customer collection; adjust if needed
  },
  rejectionReason: {
    type: String,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('FreelancerRequest', FreelancerRequestSchema);