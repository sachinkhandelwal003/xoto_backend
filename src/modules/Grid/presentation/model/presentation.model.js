const mongoose = require('mongoose');

const viewSchema = new mongoose.Schema({
  timestamp:  { type: Date, default: Date.now },
  ip:         { type: String },
  device:     { type: String, enum: ['Mobile', 'Desktop', 'Tablet'], default: 'Desktop' },
  userAgent:  { type: String },
  country:    { type: String },
});

const presentationSchema = new mongoose.Schema(
  {
    // Links
    leadId:      { type: mongoose.Schema.Types.ObjectId, ref: 'GridLead' },
    propertyId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    agentId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Settings used to generate
    settings: {
      language:  { type: String, default: 'English' },
      currency:  { type: String, default: 'AED' },
      areaUnit:  { type: String, default: 'sqft' },
      tone:      { type: String, default: 'professional' },
      sections: {
        cover:              { type: Boolean, default: true },
        projectDescription: { type: Boolean, default: true },
        developer:          { type: Boolean, default: true },
        unitPrices:         { type: Boolean, default: true },
        paymentPlan:        { type: Boolean, default: true },
        location:           { type: Boolean, default: true },
        keyHighlights:      { type: Boolean, default: true },
        gallery:            { type: Boolean, default: true },
      },
    },

    // Client info
    clientNotes: {
      clientName:   { type: String },
      budget:       { type: String },
      requirements: { type: String },
    },

    // AI Generated content
    narrative: {
      propertyOverview:  { type: String },
      keyHighlights:     [{ type: String }],
      locationCommunity: { type: String },
      investmentAngle:   { type: String },
      nextSteps:         { type: String },
    },

    // Storage
    s3Key:       { type: String },  // S3 path
    s3Url:       { type: String },  // Full S3 URL

    // Tracking
    trackingToken: { type: String, unique: true, required: true },
    views:         [viewSchema],

    // Engagement
    engagementScore: { type: Number, default: 0 },
    status:          { type: String, enum: ['draft', 'active', 'expired'], default: 'active' },

    // Presentation name
    title: { type: String },
  },
  { timestamps: true }
);

// Indexes for fast lookup
presentationSchema.index({ trackingToken: 1 });
presentationSchema.index({ agentId: 1 });
presentationSchema.index({ leadId: 1 });

module.exports = mongoose.model('Presentation', presentationSchema);