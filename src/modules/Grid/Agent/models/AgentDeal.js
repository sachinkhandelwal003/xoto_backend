// models/Deal.js
const mongoose = require("mongoose");

const DealSchema = new mongoose.Schema({
  // =========================
  // REFERENCES
  // =========================
  lead: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
  property: { type: mongoose.Schema.Types.ObjectId, ref: "Properties", required: true },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true },
  developer: { type: mongoose.Schema.Types.ObjectId, ref: "Developer" },
  agency: { type: mongoose.Schema.Types.ObjectId, ref: "Agency" },
  interestId: { type: mongoose.Schema.Types.ObjectId, ref: "LeadInterest" },

  // =========================
  // DEAL NUMBER
  // =========================
  dealNumber: { type: String, unique: true },

  // =========================
  // DEAL DETAILS
  // =========================
  dealValue: { type: Number, required: true },
  currency: { type: String, default: "AED" },

  // =========================
  // PAYMENT DETAILS
  // =========================
  tokenAmount: { type: Number, default: 0 },
  tokenReceivedAt: { type: Date, default: null },
  tokenReceipt: { type: String, default: "" },
  
  paymentPlan: { type: String, enum: ["cash", "mortgage", "payment_plan"], default: "cash" },
  
  // =========================
  // CONTRACT
  // =========================
  contractSignedAt: { type: Date, default: null },
  contractUrl: { type: String, default: "" },
  
  // =========================
  // HANDOVER
  // =========================
  handoverDate: { type: Date, default: null },
  handoverCompletedAt: { type: Date, default: null },

  // =========================
  // COMMISSION
  // =========================
  commissionAmount: { type: Number, default: 0 },
  commissionPercentage: { type: Number, default: 0 },
  commissionPaid: { type: Boolean, default: false },
  commissionPaidAt: { type: Date, default: null },

  // =========================
  // DEAL STAGES
  // =========================
  currentStage: {
    type: String,
    enum: ["unit_booked", "token_received", "contract_signed", "handover_completed"],
    default: "unit_booked"
  },
  milestones: [{
    stage: { type: String, enum: ["unit_booked", "token_received", "contract_signed", "handover_completed"] },
    status: { type: String, enum: ["pending", "completed"], default: "pending" },
    completedAt: Date,
    amount: Number,
    notes: String
  }],

  // =========================
  // APPROVALS
  // =========================
  developerApproval: {
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Developer" },
    approvedAt: Date,
    remarks: String
  },
  adminApproval: {
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    approvedAt: Date,
    remarks: String
  },

  // =========================
  // DEAL STATUS
  // =========================
  status: {
    type: String,
    enum: ["pending_approval", "approved", "in_progress", "completed", "cancelled"],
    default: "pending_approval"
  },
  cancelledReason: { type: String, default: "" },
  cancelledAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },

  // =========================
  // SOFT DELETE
  // =========================
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null }

}, { timestamps: true });

// Indexes
DealSchema.index({ lead: 1 });
DealSchema.index({ customer: 1 });
DealSchema.index({ agent: 1 });
DealSchema.index({ dealNumber: 1 }, { unique: true });
DealSchema.index({ currentStage: 1 });

// Pre-save hook
DealSchema.pre('save', async function(next) {
  if (this.isNew && !this.dealNumber) {
    const count = await mongoose.model('Deal').countDocuments();
    this.dealNumber = `DEAL-${(count + 1).toString().padStart(6, '0')}`;
  }
  next();
});

// Methods
DealSchema.methods.updateStage = async function(stage, data = {}) {
  const milestone = this.milestones.find(m => m.stage === stage);
  if (milestone) {
    milestone.status = "completed";
    milestone.completedAt = new Date();
    milestone.amount = data.amount || milestone.amount;
    milestone.notes = data.notes || milestone.notes;
  }
  
  const stages = ["unit_booked", "token_received", "contract_signed", "handover_completed"];
  const currentIndex = stages.indexOf(this.currentStage);
  const newIndex = stages.indexOf(stage);
  if (newIndex > currentIndex) {
    this.currentStage = stage;
  }
  
  if (stage === "token_received") {
    this.tokenReceivedAt = new Date();
    this.tokenAmount = data.amount || this.tokenAmount;
    this.tokenReceipt = data.receipt || this.tokenReceipt;
  }
  if (stage === "contract_signed") {
    this.contractSignedAt = new Date();
    this.contractUrl = data.contractUrl || this.contractUrl;
  }
  if (stage === "handover_completed") {
    this.handoverCompletedAt = new Date();
    this.status = "completed";
    this.completedAt = new Date();
  }
  
  return this.save();
};

DealSchema.methods.approveByAdmin = function(adminId, remarks = "") {
  this.adminApproval.status = "approved";
  this.adminApproval.approvedBy = adminId;
  this.adminApproval.approvedAt = new Date();
  this.adminApproval.remarks = remarks;
  this.status = "approved";
  return this.save();
};

DealSchema.methods.markCommissionPaid = function() {
  this.commissionPaid = true;
  this.commissionPaidAt = new Date();
  return this.save();
};

module.exports = mongoose.models.Deal || mongoose.model("Deal", DealSchema);