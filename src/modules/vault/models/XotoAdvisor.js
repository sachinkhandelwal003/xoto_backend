// models/XotoAdvisor.js
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

const advisorSchema = new mongoose.Schema(
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
    department: { type: String, default: 'Mortgage Advisory' },
    designation: { type: String, default: 'Xoto Mortgage Advisor' },
    
    // Workload Tracking
    workload: {
      currentLeads: { type: Number, default: 0 },
      maxLeadsCapacity: { type: Number, default: 20 },
      leadsAssignedThisMonth: { type: Number, default: 0 },
      leadsConvertedThisMonth: { type: Number, default: 0 },
    },
    
    // Performance Metrics
    performanceMetrics: {
      totalLeadsAssigned: { type: Number, default: 0 },
      totalLeadsContacted: { type: Number, default: 0 },
      totalLeadsQualified: { type: Number, default: 0 },
      totalApplicationsCreated: { type: Number, default: 0 },
      totalApplicationsSubmitted: { type: Number, default: 0 },
      conversionRate: { type: Number, default: 0 },
      slaComplianceRate: { type: Number, default: 100 },
      averageResponseTimeHours: { type: Number, default: 0 },
    },
    
    // SLA Tracking
    slaDeadline: { type: Date, default: null },
    slaBreached: { type: Boolean, default: false },
    
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
advisorSchema.index({ email: 1 });
advisorSchema.index({ isActive: 1 });
advisorSchema.index({ 'workload.currentLeads': 1 });

// Virtuals
advisorSchema.virtual('fullName').get(function () {
  return `${this.name.first_name} ${this.name.last_name}`;
});

advisorSchema.virtual('fullPhoneNumber').get(function () {
  return `${this.phone.country_code}${this.phone.number}`;
});

// Methods
advisorSchema.methods.isActiveAdvisor = function () {
  return this.isActive && !this.isDeleted && !this.suspendedAt;
};

advisorSchema.methods.canTakeMoreLeads = function () {
  return this.workload.currentLeads < this.workload.maxLeadsCapacity;
};

advisorSchema.methods.updateWorkload = async function (leadCount) {
  this.workload.currentLeads = leadCount;
  return this.save();
};

advisorSchema.methods.updatePerformance = async function (metrics) {
  Object.assign(this.performanceMetrics, metrics);
  if (this.performanceMetrics.totalLeadsAssigned > 0) {
    this.performanceMetrics.conversionRate = 
      (this.performanceMetrics.totalApplicationsSubmitted / this.performanceMetrics.totalLeadsAssigned) * 100;
  }
  return this.save();
};

// Static Methods
advisorSchema.statics.getLeastLoaded = function () {
  return this.find({ isActive: true, isDeleted: false })
    .sort({ 'workload.currentLeads': 1 });
};



const VaultAdvisor = mongoose.models.VaultAdvisor || mongoose.model('VaultAdvisor', advisorSchema);
module.exports = VaultAdvisor;