const mongoose = require("mongoose");

const SiteVisitSchema = new mongoose.Schema({
  // =========================
  // REFERENCES
  // =========================
  lead: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true },
  property: { type: mongoose.Schema.Types.ObjectId, ref: "Property" },
  developer: { type: mongoose.Schema.Types.ObjectId, ref: "Developer" },
  interestId: { type: mongoose.Schema.Types.ObjectId, ref: "LeadInterest" },

  // =========================
  // SCHEDULING - WITH AM/PM SUPPORT
  // =========================
  requestedDate: { type: Date, default: Date.now },
  scheduledDate: { type: Date }, // Full date object
  
  // 🔥 AM/PM TIME FIELD - Store time in 12-hour format
  visitTime: { 
    type: String,
    required: false,
    validate: {
      validator: function(v) {
        if (!v) return true; // Allow empty
        // Format: "02:30 PM" or "2:30 PM"
        return /^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/.test(v);
      },
      message: props => `${props.value} is not valid! Use format: 02:30 PM`
    }
  },
  
  // Helper fields
  time12hr: { type: String }, // "02:30 PM"
  time24hr: { type: String }, // "14:30"
  
  actualVisitDate: { type: Date },
  duration: { type: Number },
  completedAt: { type: Date },

  // =========================
  // CLIENT INFO
  // =========================
  clientName: { type: String },
  clientPhone: { type: String },

  // =========================
  // STATUS
  // =========================
  status: {
    type: String,
    enum: ["requested", "approved", "scheduled", "completed", "cancelled", "rescheduled", "no_show"],
    default: "requested"
  },

  // =========================
  // REMINDER TRACKING
  // =========================
  reminders: [{
    type: { type: String, enum: ["email", "sms", "whatsapp", "push"] },
    scheduledFor: Date,
    sentAt: Date,
    status: { type: String, enum: ["pending", "sent", "failed", "delivered"], default: "pending" }
  }],

  reminderPreferences: {
    sendReminder: { type: Boolean, default: true },
    reminderHours: { type: [Number], default: [24, 2] },
    preferredMethods: { type: [String], enum: ["email", "sms", "whatsapp"], default: ["sms", "whatsapp"] }
  },

  lastReminderSentAt: Date,
  nextReminderAt: Date,

  // =========================
  // CANCELLATION
  // =========================
  cancellationReason: { type: String },
  cancelledAt: { type: Date },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'cancelledByModel' },
  cancelledByModel: { type: String, enum: ["Agent", "Admin", "Lead"] },

  // =========================
  // RESCHEDULE
  // =========================
  rescheduledFrom: { type: mongoose.Schema.Types.ObjectId, ref: "SiteVisit" },
  rescheduledCount: { type: Number, default: 0 },
  previousDates: [{
    date: Date,
    time: String,
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
  // FEEDBACK
  // =========================
  feedback: { type: String },
  interestScore: { type: Number, min: 1, max: 10 },
  
  liked: [{ type: String }],
  disliked: [{ type: String }],
  objections: [{ type: String }],
  questions: [{ type: String }],

  notes: String,
  internalNotes: String,

}, { timestamps: true });

// =========================
// VIRTUAL FIELDS
// =========================
SiteVisitSchema.virtual("formattedDateTime").get(function() {
  if (!this.scheduledDate) return "Not scheduled";
  const date = new Date(this.scheduledDate);
  const dateStr = date.toLocaleDateString('en-GB'); // DD/MM/YYYY
  return `${dateStr} at ${this.time12hr || this.visitTime || date.toLocaleTimeString()}`;
});

SiteVisitSchema.virtual("hoursUntilVisit").get(function() {
  if (!this.scheduledDate) return null;
  const now = new Date();
  const diffMs = this.scheduledDate - now;
  return Math.round(diffMs / (1000 * 60 * 60));
});

SiteVisitSchema.virtual("minutesUntilVisit").get(function() {
  if (!this.scheduledDate) return null;
  const now = new Date();
  const diffMs = this.scheduledDate - now;
  return Math.round(diffMs / (1000 * 60));
});

// =========================
// PRE-SAVE HOOK - Handle AM/PM time
// =========================
SiteVisitSchema.pre('save', function(next) {
  // Case 1: If scheduledDate is set but no visitTime, extract time
  if (this.scheduledDate && !this.visitTime) {
    const date = new Date(this.scheduledDate);
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 should be 12
    this.time12hr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
    this.time24hr = `${date.getHours().toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    this.visitTime = this.time12hr;
  }
  
  // Case 2: If visitTime is provided (with AM/PM), update scheduledDate
  if (this.visitTime && this.scheduledDate) {
    const date = new Date(this.scheduledDate);
    const [time, modifier] = this.visitTime.split(' ');
    let [hours, minutes] = time.split(':');
    
    // Convert to 24-hour format
    if (modifier === 'PM' && hours !== '12') {
      hours = parseInt(hours, 10) + 12;
    }
    if (modifier === 'AM' && hours === '12') {
      hours = 0;
    }
    
    date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    this.scheduledDate = date;
    this.time12hr = this.visitTime;
    this.time24hr = `${date.getHours().toString().padStart(2, '0')}:${minutes}`;
  }
  
  // Case 3: If only date and time string provided separately
  if (this.scheduledDate && this.visitTime && !this.time12hr) {
    const date = new Date(this.scheduledDate);
    const [time, modifier] = this.visitTime.split(' ');
    let [hours, minutes] = time.split(':');
    
    if (modifier === 'PM' && hours !== '12') {
      hours = parseInt(hours, 10) + 12;
    }
    if (modifier === 'AM' && hours === '12') {
      hours = 0;
    }
    
    date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    this.scheduledDate = date;
    this.time12hr = this.visitTime;
    this.time24hr = `${date.getHours().toString().padStart(2, '0')}:${minutes}`;
  }
  
  next();
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

SiteVisitSchema.methods.formatTime = function() {
  return this.time12hr || this.visitTime || "Time not set";
};

// =========================
// INDEXES
// =========================
SiteVisitSchema.index({ lead: 1 });
SiteVisitSchema.index({ agent: 1 });
SiteVisitSchema.index({ property: 1 });
SiteVisitSchema.index({ scheduledDate: 1 });
SiteVisitSchema.index({ status: 1 });
SiteVisitSchema.index({ nextReminderAt: 1 });

module.exports = mongoose.models.SiteVisit || mongoose.model("SiteVisit", SiteVisitSchema);