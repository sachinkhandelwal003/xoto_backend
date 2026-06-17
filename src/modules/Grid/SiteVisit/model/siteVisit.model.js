const mongoose = require('mongoose');

const siteVisitSchema = new mongoose.Schema({
  lead:          { type: mongoose.Schema.Types.ObjectId, ref: 'GridLead', required: true },
  property:      { type: mongoose.Schema.Types.ObjectId, ref: 'Properties', required: true },
  agent:         { type: mongoose.Schema.Types.ObjectId, ref: 'GridAgent' },
  advisor:       { type: mongoose.Schema.Types.ObjectId, ref: 'GridAdvisor' },

  scheduledDate: { type: String, required: true },   // "YYYY-MM-DD"
  visitTime:     { type: String, required: true },   // "hh:mm A"
  confirmedDate: { type: String },
  confirmedTime: { type: String },

  clientName:    { type: String },
  clientPhone:   { type: String },
  visitType:     { type: String, enum: ['in_person', 'virtual'], default: 'in_person' },
  notes:         { type: String },
  adminNote:     { type: String },

  status: {
    type: String,
    enum: ['requested', 'scheduled', 'assigned', 'completed', 'cancelled'],
    default: 'requested',
  },
}, { timestamps: true });

module.exports = mongoose.model('SiteVisit', siteVisitSchema);
