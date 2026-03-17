const mongoose = require("mongoose");

const SiteVisitSchema = new mongoose.Schema({
  lead: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true },
  property: { type: mongoose.Schema.Types.ObjectId, ref: "Property" },
  developer: { type: mongoose.Schema.Types.ObjectId, ref: "Developer" },

  requestedDate: { type: Date },
  scheduledDate: { type: Date },
  visitTime: { type: String },

  clientName: { type: String },
  clientPhone: { type: String },

  status: {
    type: String,
    enum: ["requested", "approved", "scheduled", "completed", "cancelled"],
    default: "requested"
  },

  adminApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },

  // Feedback
  feedback: { type: String },
  interestScore: { type: Number, min: 1, max: 10 },
  
  liked: [{ type: String }],
  disliked: [{ type: String }],
  objections: [{ type: String }],
  questions: [{ type: String }]

}, { timestamps: true });

// Indexes
SiteVisitSchema.index({ lead: 1 });
SiteVisitSchema.index({ agent: 1 });
SiteVisitSchema.index({ scheduledDate: 1 });
SiteVisitSchema.index({ status: 1 });

module.exports = mongoose.models.SiteVisit || mongoose.model("SiteVisit", SiteVisitSchema);