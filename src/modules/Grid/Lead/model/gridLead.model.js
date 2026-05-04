// models/gridLead/gridLead.model.js (formerly propertyLead.model.js)

const mongoose = require('mongoose');

const gridLeadSchema = new mongoose.Schema({
  // ==============================================================
  // SECTION 4.1 - LEAD TYPES
  // ==============================================================
  lead_type: {
    type: String,
    enum: ['platform', 'agent', 'general'],
    required: true,
    index: true,
  },

  enquiry_type: {
    type: String,
    enum: [
      'buy', 'rent', 'sell', 'hot_property',
      'schedule_visit', 'consultation', 'general_enquiry'
    ]
  },

  // ==============================================================
  // SECTION 1.4 - CUSTOMER TRACK
  // ==============================================================
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Customer",
    required: true,
    index: true,
  },

  // ==============================================================
  // LEAD CLASSIFICATION
  // ==============================================================
  classification: {
    type: String,
    enum: ['hot', 'warm', 'cold'],
    required: true,
    default: 'warm',
    index: true,
  },

  classification_reason: { type: String, trim: true },
  classification_updated_at: { type: Date, default: Date.now },

  // ==============================================================
  // INTENT SIGNALS
  // ==============================================================
  intent_signals: {
    properties_viewed: [{
      property_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
      viewed_at: { type: Date, default: Date.now },
      time_spent_seconds: { type: Number }
    }],
    search_criteria: [{
      location: String,
      budget_min: Number,
      budget_max: Number,
      property_type: String,
      searched_at: { type: Date, default: Date.now }
    }],
    repeat_visits: { type: Number, default: 0 },
    last_activity_at: { type: Date },
    intent_level: {
      type: String,
      enum: ['high', 'medium', 'low'],
    }
  },

  // ==============================================================
  // ✅ FIXED: LEAD SOURCE — removed wrapping "type:" key
  //
  // BEFORE (BROKEN):
  //   source: {
  //     type: { channel: ..., listing_id: ... },  ← Mongoose treats "type" as SchemaType!
  //     required: true
  //   }
  //
  // AFTER (CORRECT):
  //   source: {
  //     channel: ...,   ← defined directly, no wrapping "type:" object
  //     listing_id: ...
  //   }
  // ==============================================================
  source: {
    channel: {
      type: String,
      enum: ['website_form', 'whatsapp', 'phone_call', 'email', 'bulk_upload', 'agent_added', 'admin_manual'],
      required: true
    },
    listing_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Properties',
      default: null,
    },
    referrer_url:  { type: String, trim: true },
    utm_source:    { type: String, trim: true },
    utm_medium:    { type: String, trim: true },
    utm_campaign:  { type: String, trim: true }
  },

  // ==============================================================
  // CUSTOMER REQUIREMENTS
  // ==============================================================
  requirements: {
    property_type: {
      type: String
      
    },
    transaction_type: {
      type: String,
      enum: ['buy', 'rent', 'invest'],
    },
    location_preferences: [{
      area: { type: String, trim: true },
      priority: { type: Number, min: 1, max: 5 }
    }],
    budget_min:    { type: Number, min: 0 },
    budget_max:    { type: Number, min: 0 },
    bedrooms:      { type: Number, min: 0 },
    bathrooms:     { type: Number, min: 0 },
    area_sqft_min: { type: Number, min: 0 },
    area_sqft_max: { type: Number, min: 0 },
    furnished: {
      type: String,
      enum: ['unfurnished', 'semi-furnished', 'furnished', 'any'],
      default: 'any'
    },
    ready_by_date:    { type: Date },
    additional_notes: { type: String, trim: true, maxlength: 2000 }
  },

  // ==============================================================
  // CONTACT INFORMATION
  // ==============================================================
  contact_info: {
    name: {
      first_name: { type: String, trim: true },
      last_name:  { type: String, trim: true },
      is_masked:  { type: Boolean, default: false }
    },
    mobile: {
      country_code: { type: String, trim: true, default: '+971' },
      number:       { type: String, trim: true },
      is_masked:    { type: Boolean, default: false },
      verified:     { type: Boolean, default: false },
      verified_at:  { type: Date }
    },
    email: {
      address:    { type: String, lowercase: true, trim: true },
      is_masked:  { type: Boolean, default: false },
      verified:   { type: Boolean, default: false },
      verified_at: { type: Date }
    },
    preferred_contact: {
      type: String,
      enum: ['whatsapp', 'call', 'email'],
      default: 'whatsapp'
    },
    contact_unlocked_at: { type: Date },
    unlocked_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },

  // ==============================================================
  // ASSIGNMENT DETAILS
  // ==============================================================
  assigned_to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GridAdvisor',
    default: null,
    index: true
  },

  assignment_history: [{
    assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'GridAdvisor' },
    assigned_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assigned_at: { type: Date, default: Date.now },
    reason:      { type: String, trim: true },
    notes:       { type: String, trim: true }
  }],

  assigned_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assigned_at: { type: Date, default: null },

  created_by_agent: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
  uploaded_by:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // ==============================================================
  // LEAD STATUS WORKFLOW
  // ==============================================================
  status: {
    type: String,
    enum: [
      'new', 'contacted', 'qualified', 'in_discussion',
      'site_visit_scheduled', 'offer_made', 'reserved',
      'spa_signed', 'completed', 'not_proceeding'
    ],
    default: 'new',
    index: true
  },

  status_history: [{
    status: {
      type: String,
      enum: [
        'new', 'contacted', 'qualified', 'in_discussion',
        'site_visit_scheduled', 'offer_made', 'reserved',
        'spa_signed', 'completed', 'not_proceeding'
      ]
    },
    changed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changed_at: { type: Date, default: Date.now },
    notes:      { type: String, trim: true }
  }],

  // ==============================================================
  // NOTES & COMMUNICATION
  // ==============================================================
  notes: [{
    text:        { type: String, required: true },
    author:      { type: String, required: true },
    author_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    author_type: {
      type: String,
      enum: ['advisor', 'agent', 'admin', 'system'],
      default: 'advisor'
    },
    is_private: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now }
  }],

  communications: [{
    // ✅ NOTE: "type" inside array subdoc is fine — no conflict here
    comm_type:       { type: String, enum: ['whatsapp', 'call', 'email', 'site_visit'] },
    direction:       { type: String, enum: ['inbound', 'outbound'] },
    summary:         { type: String, trim: true },
    conducted_by:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    conducted_at:    { type: Date, default: Date.now },
    duration_minutes:    { type: Number },
    follow_up_required:  { type: Boolean, default: false },
    follow_up_date:      { type: Date }
  }],

  // ==============================================================
  // MATCHED LISTINGS
  // ==============================================================
  matched_listings: [{
    listing_id:          { type: mongoose.Schema.Types.ObjectId, ref: 'Properties' },
    match_score:         { type: Number, min: 0, max: 100 },
    presented_to_client: { type: Boolean, default: false },
    presented_at:        { type: Date },
    client_interested:   { type: Boolean, default: false }
  }],

  // ==============================================================
  // AI PRESENTATIONS
  // ==============================================================
  presentations: [{
    presentation_id: { type: mongoose.Schema.Types.ObjectId },
    generated_at:    { type: Date, default: Date.now },
    shared_via:      { type: String, enum: ['whatsapp', 'email', 'link'] },
    shared_at:       { type: Date },
    tracking_link:   { type: String },
    engagement: {
      viewed:              { type: Boolean, default: false },
      viewed_at:           { type: Date },
      device_type:         { type: String },
      time_spent_seconds:  { type: Number },
      view_count:          { type: Number, default: 0 }
    }
  }],

  // ==============================================================
  // DEAL INFORMATION
  // ==============================================================
  deal_record: {
    created:            { type: Boolean, default: false },
    deal_record_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'DealRecord' },
    transaction_value:  { type: Number },
    commission_amount:  { type: Number },
    commission_status: {
      type: String,
      enum: ['pending', 'confirmed', 'paid'],
      default: 'pending'
    },
    evidence_uploaded:  { type: Boolean, default: false },
    evidence_documents: [{
      doc_type:    { type: String, enum: ['spa', 'booking_form', 'title_deed'] },
      url:         { type: String },
      uploaded_at: { type: Date }
    }],
    closed_at: { type: Date }
  },

  // ==============================================================
  // FOLLOW-UP MANAGEMENT
  // ==============================================================
  next_follow_up_date:      { type: Date },
  follow_up_reminder_sent:  { type: Boolean, default: false },
  last_contacted_at:        { type: Date },

  // ==============================================================
  // DUPLICATE MANAGEMENT
  // ==============================================================
  is_duplicate:     { type: Boolean, default: false },
  parent_lead_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'GridLead' },
  duplicate_reason: { type: String, trim: true },

  // ==============================================================
  // SYSTEM FIELDS
  // ==============================================================
  is_active:   { type: Boolean, default: true,  index: true },
  is_deleted:  { type: Boolean, default: false, index: true },
  deleted_at:  { type: Date },
  deleted_by:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_by:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_by:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

}, {
  timestamps: true,
  toJSON:   { virtuals: true },
  toObject: { virtuals: true }
});

// ==============================================================
// VIRTUAL FIELDS
// ==============================================================

gridLeadSchema.virtual('full_name').get(function() {
  if (this.contact_info?.name?.first_name || this.contact_info?.name?.last_name) {
    return `${this.contact_info.name.first_name || ''} ${this.contact_info.name.last_name || ''}`.trim();
  }
  return 'Unknown Customer';
});

gridLeadSchema.virtual('age_days').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

gridLeadSchema.virtual('contact_accessible').get(function() {
  return !!(this.contact_info?.contact_unlocked_at &&
            this.contact_info.contact_unlocked_at <= new Date());
});

// ==============================================================
// INDEXES
// ==============================================================

gridLeadSchema.index({ lead_type: 1, status: 1, createdAt: -1 });
gridLeadSchema.index({ assigned_to: 1, status: 1 });
gridLeadSchema.index({ customerId: 1, createdAt: -1 });
gridLeadSchema.index({ classification: 1, assigned_to: 1 });
gridLeadSchema.index({ 'contact_info.mobile.number': 1 });
gridLeadSchema.index({ 'contact_info.email.address': 1 });
gridLeadSchema.index({ next_follow_up_date: 1, status: 1 });
gridLeadSchema.index({ assigned_to: 1, next_follow_up_date: 1 });
gridLeadSchema.index({ createdAt: 1, lead_type: 1 });
gridLeadSchema.index({ 'source.channel': 1, createdAt: -1 });
gridLeadSchema.index({ 'source.listing_id': 1 });                    // ✅ new index
gridLeadSchema.index({ status: 1, 'deal_record.commission_status': 1 });

// ==============================================================
// MIDDLEWARE
// ==============================================================

gridLeadSchema.pre('save', function(next) {
  if (this.isModified('classification')) {
    this.classification_updated_at = new Date();
  }

  if (this.isModified('status') && !this.isNew) {
    const oldStatus = this._originalStatus;
    if (oldStatus && oldStatus !== this.status) {
      this.status_history.push({
        status: this.status,
        changed_by: this.updated_by || this.assigned_by,
        changed_at: new Date()
      });
    }
  }

  if (!this.isNew) {
    this._originalStatus = this.status;
  }

  if (this.status === 'completed' && !this.deal_record?.created) {
    this.deal_record = {
      ...this.deal_record,
      created: true,
      closed_at: new Date()
    };
  }

  next();
});

// Soft delete middleware
gridLeadSchema.pre(['find', 'findOne', 'findOneAndUpdate', 'countDocuments'], function() {
  if (!this.getOptions?.()?.includeDeleted) {
    this.where({ is_deleted: false });
  }
});

gridLeadSchema.pre('aggregate', function() {
  const pipeline = this.pipeline();
  const hasDeletedFilter = pipeline.some(
    stage => stage.$match && stage.$match.is_deleted !== undefined
  );
  if (!hasDeletedFilter) {
    pipeline.unshift({ $match: { is_deleted: false } });
  }
});

// ==============================================================
// STATIC METHODS
// ==============================================================

gridLeadSchema.statics.findByCustomer = function(customerId, options = {}) {
  const { includeInactive = false, limit = 10, skip = 0 } = options;
  const query = { customerId, is_deleted: false };
  if (!includeInactive) query.is_active = true;
  return this.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
};

gridLeadSchema.statics.getActiveLeadForCustomer = function(customerId) {
  return this.findOne({
    customerId,
    is_deleted: false,
    status: { $nin: ['completed', 'not_proceeding'] }
  }).sort({ createdAt: -1 });
};

gridLeadSchema.statics.checkDuplicate = function(customerId, daysWindow = 30) {
  const fromDate = new Date(Date.now() - daysWindow * 24 * 60 * 60 * 1000);
  return this.find({
    customerId,
    createdAt: { $gte: fromDate },
    status: { $nin: ['completed', 'not_proceeding'] },
    is_deleted: false
  }).sort({ createdAt: -1 });
};

gridLeadSchema.statics.assignToAdvisor = async function(leadId, advisorId, assignedBy, notes = '') {
  const lead = await this.findById(leadId);
  if (!lead) throw new Error('Lead not found');

  lead.assignment_history.push({
    assigned_to: advisorId,
    assigned_by: assignedBy,
    assigned_at: new Date(),
    notes
  });

  lead.assigned_to = advisorId;
  lead.assigned_by = assignedBy;
  lead.assigned_at = new Date();

  if (lead.status === 'not_proceeding') {
    lead.status = 'new';
    lead.status_history.push({
      status: 'new',
      changed_by: assignedBy,
      changed_at: new Date(),
      notes: 'Reassigned to new advisor'
    });
  }

  await lead.save();
  return lead;
};

gridLeadSchema.statics.bulkUpload = async function(leadsData, uploadedBy) {
  const leads = leadsData.map(leadData => ({
    ...leadData,
    lead_type: 'general',
    uploaded_by: uploadedBy,
    classification: 'warm',
    source: { channel: 'bulk_upload' }
  }));
  return this.insertMany(leads, { ordered: false });
};

gridLeadSchema.statics.getFollowUpRequired = function(assignedTo = null) {
  const query = {
    status: { $nin: ['completed', 'not_proceeding'] },
    next_follow_up_date: { $lte: new Date() },
    follow_up_reminder_sent: false,
    is_deleted: false
  };
  if (assignedTo) query.assigned_to = assignedTo;
  return this.find(query).sort({ next_follow_up_date: 1 });
};

// ==============================================================
// INSTANCE METHODS
// ==============================================================

gridLeadSchema.methods.updateStatus = async function(newStatus, userId, notes = '') {
  if (this.status === newStatus) return this;
  this.status = newStatus;
  this.status_history.push({
    status: newStatus,
    changed_by: userId,
    changed_at: new Date(),
    notes
  });
  if (newStatus === 'contacted' && this.status === 'new') {
    this.last_contacted_at = new Date();
  }
  if (newStatus === 'completed') {
    this.deal_record.closed_at = new Date();
    this.deal_record.created = true;
  }
  await this.save();
  return this;
};

gridLeadSchema.methods.unlockContactInfo = async function(userId) {
  if (!this.contact_info.contact_unlocked_at) {
    this.contact_info.contact_unlocked_at = new Date();
    this.contact_info.unlocked_by = userId;
    if (this.contact_info.name)   this.contact_info.name.is_masked   = false;
    if (this.contact_info.mobile) this.contact_info.mobile.is_masked = false;
    if (this.contact_info.email)  this.contact_info.email.is_masked  = false;
    await this.save();
  }
  return this;
};

gridLeadSchema.methods.addMatchedListing = async function(listingId, matchScore = 0) {
  const alreadyMatched = this.matched_listings.some(
    m => m.listing_id.toString() === listingId.toString()
  );
  if (!alreadyMatched) {
    this.matched_listings.push({ listing_id: listingId, match_score: matchScore, presented_to_client: false });
    await this.save();
  }
  return this;
};

gridLeadSchema.methods.logCommunication = async function(commData) {
  this.communications.push(commData);
  this.last_contacted_at = commData.conducted_at || new Date();
  if (commData.follow_up_required && commData.follow_up_date) {
    this.next_follow_up_date = commData.follow_up_date;
    this.follow_up_reminder_sent = false;
  }
  await this.save();
  return this;
};

gridLeadSchema.methods.markAsDuplicate = async function(parentLeadId, reason) {
  this.is_duplicate = true;
  this.parent_lead_id = parentLeadId;
  this.duplicate_reason = reason;
  this.is_active = false;
  await this.save();
  return this;
};

// ==============================================================
// MODEL EXPORT
// ==============================================================

const GridLead = mongoose.model('GridLead', gridLeadSchema);

module.exports = GridLead;