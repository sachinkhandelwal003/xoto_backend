const mongoose = require("mongoose");

const ChatRequestSchema = new mongoose.Schema({
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Agent",
    required: true
  },
  agentName: { type: String },

  // Kis cheez ke liye chat chahiye
  reason: { type: String, required: true },
  topic: {
    type: String,
    enum: ["site_visit", "commission", "project_info", "general"],
    default: "general"
  },
  developer: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Developer",
},

  // Related lead (optional)
  lead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Lead"
  },

  // Status
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },

  rejectionReason: { type: String },

  // Admin jo approve/reject kare
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId
  },
  reviewedAt: { type: Date }

}, { timestamps: true });

module.exports = mongoose.models.ChatRequest ||
  mongoose.model("ChatRequest", ChatRequestSchema);