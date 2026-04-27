// models/MortgageOps.js
const mongoose = require('mongoose');

const nameSchema = new mongoose.Schema(
  {
    first_name: { type: String, required: true, trim: true },
    last_name: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const phoneSchema = new mongoose.Schema(
  {
    country_code: { type: String, default: '+971' },
    number: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const mortgageOpsSchema = new mongoose.Schema(
  {
    // Basic Info
    name: { type: nameSchema, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: phoneSchema, required: true },
    profilePic: { type: String, default: null },
    dateOfBirth: { type: Date, default: null },
    nationality: { type: String, default: null },
    gender: { type: String, enum: ['Male', 'Female', 'Other'], default: null },
    
    // Employment Info
    joinDate: { type: Date, default: Date.now },
    department: { type: String, default: 'Mortgage Operations' },
    designation: { type: String, default: 'Mortgage Operations Executive' },
    
    // Workload Tracking
    workload: {
      currentApplications: { type: Number, default: 0 },
      maxCapacity: { type: Number, default: 30 },
      applicationsProcessedThisMonth: { type: Number, default: 0 },
      averageProcessingDays: { type: Number, default: 0 },
    },
    
    // Performance Metrics
    performanceMetrics: {
      totalApplicationsProcessed: { type: Number, default: 0 },
      totalApplicationsReturned: { type: Number, default: 0 },
      returnRate: { type: Number, default: 0 },
      totalDisbursed: { type: Number, default: 0 },
      averageTurnaroundDays: { type: Number, default: 0 },
      totalBankSubmissions: { type: Number, default: 0 },
    },
    
    // Queue Management
    queueStatus: {
      pendingReview: { type: Number, default: 0 },
      inProgress: { type: Number, default: 0 },
      waitingBank: { type: Number, default: 0 },
    },
    
    // Role Reference
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
    },
    
    // System Access
    password: { type: String, required: true, select: false },
    lastLoginAt: { type: Date, default: null },
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
    
    // Status
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: true },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    verifiedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    suspendedAt: { type: Date, default: null },
    suspensionReason: { type: String, default: null },
  },
  { timestamps: true }
);

// Indexes
mortgageOpsSchema.index({ email: 1 });
mortgageOpsSchema.index({ isActive: 1 });
mortgageOpsSchema.index({ 'workload.currentApplications': 1 });

// Virtuals
mortgageOpsSchema.virtual('fullName').get(function () {
  return `${this.name.first_name} ${this.name.last_name}`;
});

mortgageOpsSchema.virtual('fullPhoneNumber').get(function () {
  return `${this.phone.country_code}${this.phone.number}`;
});

// Methods
mortgageOpsSchema.methods.isActiveOps = function () {
  return this.isActive && !this.isDeleted && !this.suspendedAt;
};

mortgageOpsSchema.methods.canTakeMoreApplications = function () {
  return this.workload.currentApplications < this.workload.maxCapacity;
};

mortgageOpsSchema.methods.updateWorkload = async function (appCount) {
  this.workload.currentApplications = appCount;
  return this.save();
};

mortgageOpsSchema.methods.updatePerformance = async function (metrics) {
  Object.assign(this.performanceMetrics, metrics);
  
  // Calculate return rate
  if (this.performanceMetrics.totalApplicationsProcessed > 0) {
    this.performanceMetrics.returnRate = 
      (this.performanceMetrics.totalApplicationsReturned / this.performanceMetrics.totalApplicationsProcessed) * 100;
  }
  
  return this.save();
};

mortgageOpsSchema.methods.updateQueueStatus = async function () {
  // This would be called when applications are assigned/processed
  // You can implement logic to calculate queue status from assigned cases
  return this.save();
};

// Static Methods
mortgageOpsSchema.statics.getLeastLoaded = function () {
  return this.find({ isActive: true, isDeleted: false })
    .sort({ 'workload.currentApplications': 1 });
};

mortgageOpsSchema.statics.getOpsWithCapacity = function () {
  return this.find({ 
    isActive: true, 
    isDeleted: false,
    'workload.currentApplications': { $lt: '$workload.maxCapacity' }
  });
};



const MortgageOps = mongoose.models.MortgageOps || mongoose.model('MortgageOps', mortgageOpsSchema);
module.exports = MortgageOps;