const mongoose = require('mongoose');
const { ROLES } = require('../../../../utils/constants/roles');

const EmployeeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    select: false
  },
  mobileNumber: {
    type: String,
    required: true,
  },
  designation: {
    type: String,
    trim: true,
    default: 'Employee'
  },
  role: {
    type: Number,
    enum: Object.values(ROLES),
    default: ROLES.EMPLOYEE
  },
  isActive: {
    type: Boolean,
    default: true
  },
  status: {
    type: Number,
    enum: [0, 1],
    default: 1
  },
    createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Employee', EmployeeSchema);
