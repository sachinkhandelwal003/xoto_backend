// models/Freelancer/projectfreelancer.model.js
const mongoose = require('mongoose');

const dailyUpdateSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  work_done: { type: String, required: true, trim: true },
  photos: [{ type: String }],
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approval_status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  approved_progress: { type: Number, min: 0, max: 100, default: 0 },
  approved_at: { type: Date },
  rejected_at: { type: Date },
  rejection_reason: { type: String, trim: true },
  site_inspection_report: { type: String }, // NEW
  change_requests: [{ type: String }], // NEW
  client_feedback: { type: String } // NEW
}, { _id: true, timestamps: true });

const milestoneSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  start_date: { type: Date, required: true },
  end_date: { type: Date, required: true },
  due_date: { type: Date, required: true },
  amount: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'release_requested', 'approved', 'cancelled'],
    default: 'pending'
  },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  photos: [{ type: String }],
  notes: { type: String, trim: true },
  daily_updates: [dailyUpdateSchema],
  release_requested_at: { type: Date },
  approved_at: { type: Date },
  is_deleted: { type: Boolean, default: false },
  deleted_at: { type: Date }
}, { timestamps: true });

// Validate: start < end
milestoneSchema.pre('save', function(next) {
  if (this.start_date && this.end_date && this.start_date >= this.end_date) {
    return next(new Error('start_date must be before end_date'));
  }
  if (this.isModified('progress') && this.progress === 100 && 
      !['release_requested', 'approved'].includes(this.status)) {
    this.status = 'release_requested';
    this.release_requested_at = new Date();
  } else if (this.progress > 0 && this.progress < 100 && this.status === 'pending') {
    this.status = 'in_progress';
  }
  next();
});

const projectSchema = new mongoose.Schema({
  // 1. Basic Project Details
  project_id: { type: String, unique: true, trim: true }, // Project ID/Reference Number
  title: { type: String, required: true, trim: true }, // Project Name
  client_name: { type: String, required: true, trim: true },
  client_company: { type: String, trim: true },
  project_type: {
    type: String,
    enum: ['Residential', 'Commercial', 'Public', 'Resort', 'Urban', 'Other'],
    required: true
  },
  address: { type: String, required: true, trim: true },
  city: { type: String, required: true, trim: true },
  gps_coordinates: { // NEW
    latitude: { type: Number },
    longitude: { type: Number }
  },
  start_date: { type: Date, required: true },
  end_date: { type: Date, required: true },
  project_duration: { type: String, trim: true }, // NEW: Weeks/Months

  // 2. Project Scope & Description
  overview: { type: String, trim: true }, // Project Overview/Objective
  site_area: { // NEW
    value: { type: Number },
    unit: { type: String, enum: ['sq_ft', 'sq_m'], default: 'sq_m' }
  },
  design_concept: { type: String, trim: true }, // NEW: Theme
  work_scope: { // NEW
    softscaping: { type: Boolean, default: false },
    hardscaping: { type: Boolean, default: false },
    irrigation_systems: { type: Boolean, default: false },
    lighting_design: { type: Boolean, default: false },
    water_features: { type: Boolean, default: false },
    furniture_accessories: { type: Boolean, default: false },
    maintenance_plan: { type: Boolean, default: false }
  },
  scope_details: { type: String, trim: true }, // NEW: Detailed scope description

  // 3. Design & Planning Details
  landscape_architect: { type: String, trim: true }, // NEW
  drawings_blueprints: [{ type: String }], // NEW: File URLs
  planting_plan: { type: String, trim: true }, // NEW
  material_specifications: { type: String, trim: true }, // NEW
  irrigation_plan: { type: String, trim: true }, // NEW
  lighting_plan: { type: String, trim: true }, // NEW
  visualization_3d: [{ type: String }], // NEW: 3D files

  // 4. Resource Allocation
  team_members: [{ // NEW
    name: { type: String, trim: true },
    role: { type: String, trim: true },
    contact: { type: String, trim: true }
  }],
  machinery_equipment: [{ type: String, trim: true }], // NEW
  materials_list: [{ // NEW
    item: { type: String, trim: true },
    quantity: { type: Number },
    unit: { type: String, trim: true },
    supplier: { type: String, trim: true }
  }],
  suppliers: [{ type: String, trim: true }], // NEW
  manpower_allocation: { type: String, trim: true }, // NEW

  // 5. Budget & Costing
  budget: { type: Number, required: true, min: 0 },
  cost_breakdown: { // NEW
    materials: { type: Number, default: 0 },
    labor: { type: Number, default: 0 },
    equipment: { type: Number, default: 0 },
    overheads: { type: Number, default: 0 },
    contingency: { type: Number, default: 0 }
  },
  payment_terms: { type: String, trim: true }, // NEW

  // 6. Timeline & Milestones
  project_schedule: { type: String, trim: true }, // NEW
  milestones: [milestoneSchema],

  // 7. Compliance & Safety
  permits_approvals: [{ // NEW
    name: { type: String, trim: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    document: { type: String } // File URL
  }],
  safety_guidelines: { type: String, trim: true }, // NEW
  environmental_compliance: { type: String, trim: true }, // NEW
  waste_disposal_plan: { type: String, trim: true }, // NEW

  // 8. Progress & Reporting
  progress_logs: [{ // NEW
    date: { type: Date },
    description: { type: String, trim: true },
    photos: [{ type: String }],
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  inspection_reports: [{ // NEW
    date: { type: Date },
    findings: { type: String, trim: true },
    recommendations: { type: String, trim: true },
    inspector: { type: String, trim: true }
  }],
  change_requests: [{ // NEW
    date: { type: Date },
    description: { type: String, trim: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'] },
    impact: { type: String, trim: true } // Cost/time impact
  }],
  client_feedback: [{ // NEW
    date: { type: Date },
    feedback: { type: String, trim: true },
    rating: { type: Number, min: 1, max: 5 }
  }],

  // Existing fields
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category_freelancer', required: true },
  subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcategory_freelancer', required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  freelancer: { type: mongoose.Schema.Types.ObjectId, ref: 'Freelancer' },
  accountant: { type: mongoose.Schema.Types.ObjectId, ref: 'Accountant' },

  status: {
    type: String,
    enum: ['draft', 'assigned', 'in_progress', 'completed', 'cancelled'],
    default: 'draft'
  },
  is_deleted: { type: Boolean, default: false },
  deleted_at: { type: Date }
}, { timestamps: true });

// Auto-generate project_id before save
projectSchema.pre('save', async function(next) {
  if (!this.project_id) {
    const count = await mongoose.model('Project_freelancer').countDocuments();
    this.project_id = `PROJ-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Auto project status + accountant
// Auto project status + accountant
projectSchema.pre('save', async function (next) {
  try {
    const active = this.milestones.filter(m => !m.is_deleted);
    const approved = active.filter(m => m.status === 'approved');

    if (active.length > 0 && approved.length === active.length) {
      // All milestones approved → mark project as completed
      this.status = 'completed';
    } else if (this.freelancer && approved.length < active.length) {
      // Some milestones approved → in progress
      this.status = 'in_progress';
    } else if (this.freelancer) {
      // Has freelancer assigned → assigned
      this.status = 'assigned';
    }

    next();
  } catch (err) {
    next(err);
  }
});



projectSchema.index({ customer: 1, freelancer: 1, status: 1, is_deleted: 1 });
projectSchema.pre(['find', 'findOne', 'findOneAndUpdate'], function() {
  this.where({ is_deleted: false });
});

module.exports = mongoose.model('Project_freelancer', projectSchema);