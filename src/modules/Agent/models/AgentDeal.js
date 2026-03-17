const mongoose = require("mongoose");

const DealSchema = new mongoose.Schema({
  lead: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true },
  developer: { type: mongoose.Schema.Types.ObjectId, ref: "Developer" },
  property: { type: mongoose.Schema.Types.ObjectId, ref: "Property" },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: "PropertyInventory" },

  dealValue: { type: Number, required: true },
  tokenAmount: { type: Number, default: 0 },
  tokenReceivedAt: Date,
  contractSignedAt: Date,
  handoverDate: Date,

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

  commission: { type: mongoose.Schema.Types.ObjectId, ref: "Commission" },

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

  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date

}, { timestamps: true });

DealSchema.index({ lead: 1 });
DealSchema.index({ agent: 1 });
DealSchema.index({ developer: 1 });
DealSchema.index({ currentStage: 1 });

module.exports = mongoose.models.Deal || mongoose.model("Deal", DealSchema);