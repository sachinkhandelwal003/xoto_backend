const mongoose = require("mongoose");

const SiteVisitSchema = new mongoose.Schema({
  // =========================
  // REFERENCES
  // =========================
  lead: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true },
  property: { type: mongoose.Schema.Types.ObjectId, ref: "Property" },
  developer: { type: mongoose.Schema.Types.ObjectId, ref: "Developer" },
  
  // Link to LeadInterest (optional but recommended)
  interestId: { type: mongoose.Schema.Types.ObjectId, ref: "LeadInterest" },

  // =========================
  // SCHEDULING
  // =========================
  requestedDate: { type: Date, default: Date.now },
  scheduledDate: { type: Date },
  visitTime: { type: String },
  actualVisitDate: { type: Date }, // When they actually came
  duration: { type: Number }, // minutes spent on site
  completedAt: { type: Date },

  // =========================
  // CLIENT INFO
  // =========================
  clientName: { type: String },
  clientPhone: { type: String },

  // =========================
  // STATUS (FR-A50)
  // =========================
  status: {
    type: String,
    enum: ["requested", "approved", "scheduled", "completed", "cancelled", "rescheduled", "no_show"],
    default: "requested"
  },

  // =========================
  // REMINDER TRACKING (FR-A51)
  // =========================
  reminders: [{
    type: { type: String, enum: ["email", "sms", "whatsapp", "push"] },
    scheduledFor: Date,
    sentAt: Date,
    status: { type: String, enum: ["pending", "sent", "failed", "delivered"], default: "pending" }
  }],

  reminderPreferences: {
    sendReminder: { type: Boolean, default: true },
    reminderHours: { type: [Number], default: [24, 2] }, // Send 24h and 2h before
    preferredMethods: { type: [String], enum: ["email", "sms", "whatsapp"], default: ["sms", "whatsapp"] }
  },

  lastReminderSentAt: Date,
  nextReminderAt: Date,

  // =========================
  // CANCELLATION TRACKING
  // =========================
  cancellationReason: { type: String },
  cancelledAt: { type: Date },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'cancelledByModel' },
  cancelledByModel: { type: String, enum: ["Agent", "Admin", "Lead"] },

  // =========================
  // RESCHEDULE TRACKING
  // =========================
  rescheduledFrom: { type: mongoose.Schema.Types.ObjectId, ref: "SiteVisit" },
  rescheduledCount: { type: Number, default: 0 },
  previousDates: [{
    date: Date,
    reason: String,
    rescheduledAt: Date,
    rescheduledBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'rescheduledByModel' },
    rescheduledByModel: String
  }],

  // =========================
  // ADMIN APPROVAL
  // =========================
  adminApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  approvedAt: Date,

  // =========================
  // FEEDBACK (FR-A52)
  // =========================
  feedback: { type: String },
  interestScore: { type: Number, min: 1, max: 10 },
  
  liked: [{ type: String }],
  disliked: [{ type: String }],
  objections: [{ type: String }],
  questions: [{ type: String }],

  // =========================
  // NOTES
  // =========================
  notes: String,
  internalNotes: String,

}, { timestamps: true });

// =========================
// INDEXES
// =========================
SiteVisitSchema.index({ lead: 1 });
SiteVisitSchema.index({ agent: 1 });
SiteVisitSchema.index({ property: 1 });
SiteVisitSchema.index({ scheduledDate: 1 });
SiteVisitSchema.index({ status: 1 });
SiteVisitSchema.index({ nextReminderAt: 1 });

// =========================
// VIRTUAL FIELDS
// =========================
SiteVisitSchema.virtual("hoursUntilVisit").get(function() {
  if (!this.scheduledDate) return null;
  const now = new Date();
  const visitTime = new Date(this.scheduledDate);
  const diffMs = visitTime - now;
  return Math.round(diffMs / (1000 * 60 * 60));
});

SiteVisitSchema.virtual("needsReminder").get(function() {
  if (!this.scheduledDate || this.status !== "scheduled") return false;
  if (this.lastReminderSentAt) {
    const hoursSinceLastReminder = (new Date() - this.lastReminderSentAt) / (1000 * 60 * 60);
    if (hoursSinceLastReminder < 12) return false;
  }
  
  const hoursUntil = this.hoursUntilVisit;
  return this.reminderPreferences.reminderHours.some(h => 
    Math.abs(hoursUntil - h) < 1
  );
});

// =========================
// METHODS
// =========================
SiteVisitSchema.methods.scheduleReminders = async function() {
  if (!this.scheduledDate) return this;
  
  const reminderTimes = this.reminderPreferences.reminderHours.map(hours => {
    const reminderDate = new Date(this.scheduledDate);
    reminderDate.setHours(reminderDate.getHours() - hours);
    return reminderDate;
  });

  this.reminders = reminderTimes.map(time => ({
    scheduledFor: time,
    status: "pending"
  }));

  this.nextReminderAt = reminderTimes[0];
  return this.save();
};

SiteVisitSchema.methods.markReminderSent = function(reminderIndex) {
  if (this.reminders && this.reminders[reminderIndex]) {
    this.reminders[reminderIndex].sentAt = new Date();
    this.reminders[reminderIndex].status = "sent";
    this.lastReminderSentAt = new Date();
    
    if (this.reminders[reminderIndex + 1]) {
      this.nextReminderAt = this.reminders[reminderIndex + 1].scheduledFor;
    } else {
      this.nextReminderAt = null;
    }
  }
  return this.save();
};

SiteVisitSchema.methods.cancel = function(reason, cancelledBy) {
  this.status = "cancelled";
  this.cancellationReason = reason;
  this.cancelledAt = new Date();
  this.cancelledBy = cancelledBy?._id || cancelledBy;
  this.cancelledByModel = cancelledBy?.constructor?.modelName || "Agent";
  return this.save();
};

SiteVisitSchema.methods.reschedule = function(newDate, reason, rescheduledBy) {
  this.previousDates.push({
    date: this.scheduledDate,
    reason: reason,
    rescheduledAt: new Date(),
    rescheduledBy: rescheduledBy?._id || rescheduledBy,
    rescheduledByModel: rescheduledBy?.constructor?.modelName || "Agent"
  });

  this.scheduledDate = newDate;
  this.status = "scheduled";
  this.rescheduledCount += 1;
  
  return this.scheduleReminders();
};

SiteVisitSchema.methods.complete = function(feedbackData) {
  this.status = "completed";
  this.completedAt = new Date();
  this.actualVisitDate = this.scheduledDate;
  
  if (feedbackData) {
    this.feedback = feedbackData.feedback;
    this.interestScore = feedbackData.interestScore;
    this.liked = feedbackData.liked || [];
    this.disliked = feedbackData.disliked || [];
    this.objections = feedbackData.objections || [];
    this.questions = feedbackData.questions || [];
  }
  
  return this.save();
};

// =========================
// STATIC METHODS
// =========================
SiteVisitSchema.statics.findVisitsNeedingReminders = function() {
  const now = new Date();
  return this.find({
    status: "scheduled",
    nextReminderAt: { $lte: now },
    "reminders.status": { $ne: "sent" }
  }).populate("lead agent");
};

SiteVisitSchema.statics.findUpcomingForLead = function(leadId) {
  return this.find({
    lead: leadId,
    status: { $in: ["scheduled", "approved"] },
    scheduledDate: { $gte: new Date() }
  }).sort({ scheduledDate: 1 });
};

module.exports = mongoose.models.SiteVisit || mongoose.model("SiteVisit", SiteVisitSchema);