// models/SiteVisit.js
const mongoose = require("mongoose");

const SiteVisitSchema = new mongoose.Schema({
  // =========================
  // REFERENCES
  // =========================
  lead: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true },
  property: { type: mongoose.Schema.Types.ObjectId, ref: "Properties", required: true },
  developer: { type: mongoose.Schema.Types.ObjectId, ref: "Developer" },
  interestId: { type: mongoose.Schema.Types.ObjectId, ref: "LeadInterest" },

  // =========================
  // VISIT DETAILS
  // =========================
  requestedDate: { type: Date, default: Date.now },
  scheduledDate: { type: Date },
  visitTime: { type: String },
  actualVisitDate: { type: Date },
  duration: { type: Number },
  completedAt: { type: Date },

  // =========================
  // CLIENT INFO
  // =========================
  clientName: { type: String },
  clientPhone: { type: String },
  notes: { type: String },

  // =========================
  // STATUS
  // =========================
  status: {
    type: String,
    enum: ["requested", "approved", "scheduled", "completed", "cancelled", "no_show"],
    default: "requested"
  },

  // =========================
  // REMINDERS
  // =========================
  reminders: [{
    type: { type: String, enum: ["email", "sms", "whatsapp"] },
    scheduledFor: Date,
    sentAt: Date,
    status: { type: String, enum: ["pending", "sent", "failed"], default: "pending" }
  }],

  // =========================
  // FEEDBACK (After Visit)
  // =========================
  feedback: { type: String },
  interestScore: { type: Number, min: 1, max: 10 },
  liked: [{ type: String }],
  disliked: [{ type: String }],
  objections: [{ type: String }],
  questions: [{ type: String }],

  // =========================
  // ADMIN APPROVAL
  // =========================
  adminApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  approvedAt: Date,

  // =========================
  // CANCELLATION
  // =========================
  cancellationReason: { type: String },
  cancelledAt: { type: Date },

  // =========================
  // RESCHEDULE
  // =========================
  rescheduledFrom: { type: mongoose.Schema.Types.ObjectId, ref: "SiteVisit" },
  rescheduledCount: { type: Number, default: 0 },
  previousDates: [{
    date: Date,
    time: String,
    reason: String,
    rescheduledAt: Date
  }]

}, { timestamps: true });

// Indexes
SiteVisitSchema.index({ lead: 1 });
SiteVisitSchema.index({ agent: 1 });
SiteVisitSchema.index({ scheduledDate: 1 });
SiteVisitSchema.index({ status: 1 });

// Virtuals
SiteVisitSchema.virtual("formattedDateTime").get(function() {
  if (!this.scheduledDate) return "Not scheduled";
  const date = new Date(this.scheduledDate);
  return `${date.toLocaleDateString()} at ${this.visitTime || date.toLocaleTimeString()}`;
});

// Methods
SiteVisitSchema.methods.scheduleReminders = async function() {
  if (!this.scheduledDate) return this;
  
  const reminderHours = [24, 2];
  this.reminders = reminderHours.map(hours => ({
    scheduledFor: new Date(this.scheduledDate.getTime() - hours * 60 * 60 * 1000),
    status: "pending"
  }));
  return this.save();
};

SiteVisitSchema.methods.complete = function(feedbackData) {
  this.status = "completed";
  this.completedAt = new Date();
  this.feedback = feedbackData.feedback;
  this.interestScore = feedbackData.interestScore;
  this.liked = feedbackData.liked || [];
  this.disliked = feedbackData.disliked || [];
  this.objections = feedbackData.objections || [];
  this.questions = feedbackData.questions || [];
  return this.save();
};

SiteVisitSchema.methods.reschedule = function(newDate, reason, rescheduledBy) {
  this.previousDates.push({
    date: this.scheduledDate,
    time: this.visitTime,
    reason: reason,
    rescheduledAt: new Date()
  });
  this.scheduledDate = newDate;
  this.rescheduledCount += 1;
  this.status = "scheduled";
  this.notes = `Rescheduled: ${reason}`;
  return this.scheduleReminders();
};

module.exports = mongoose.models.SiteVisit || mongoose.model("SiteVisit", SiteVisitSchema);