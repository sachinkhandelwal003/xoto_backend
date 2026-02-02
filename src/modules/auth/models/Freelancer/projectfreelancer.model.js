// models/Freelancer/projectfreelancer.model.js
const mongoose = require('mongoose');

const dailyUpdateSchema = new mongoose.Schema({
  date: { type: Date, required: true, default: Date.now },
  work_done: { type: String, required: true, trim: true },
  photos: [{ type: String }],
  notes: { type: String, trim: true },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // customer, freelancer
  approval_status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  approved_progress: { type: Number, min: 0, max: 100, default: 0 },
  approved_at: { type: Date },
  rejected_at: { type: Date },
  rejection_reason: { type: String }
}, { timestamps: true });

  const milestoneSchema = new mongoose.Schema({
    milestone_number: { type: Number, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true },
    due_date: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'release_requested', 'approved', 'cancelled'],
      default: 'pending'
    },
    photos: [{ type: String }],
    notes: { type: String },
    daily_updates: [dailyUpdateSchema],
    release_requested_at: { type: Date },
    milestone_weightage: { type: Number, required: false, default: 0 },
    customer_approval_after_completion: { type: Boolean, required: false, default: false },
    freelancer_approv_after_completion: { type: Boolean, required: false, default: false },
    approved_at: { type: Date },
    is_deleted: { type: Boolean, default: false }
  }, { timestamps: true });

const projectSchema = new mongoose.Schema({
  Code: { type: String, unique: true },
  title: { type: String, required: true },
  client_name: { type: String, required: true },
  client_company: { type: String },
  address: { type: String, default: "" },
  city: { type: String, default: "" },
  gps_coordinates: { latitude: Number, longitude: Number },
  start_date: { type: Date, required: true },
  end_date: { type: Date, required: true },
  budget: { type: Number, required: true, min: 0 },
  overview: { type: String },
  scope_details: { type: String },

  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category_freelancer', required: true },
  subcategory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subcategory_freelancer' }], // ← ARRAY
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  //assigned_supervisor
  assigned_supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'Allusers' }, // assigned supervisor
  assigned_freelancer: { type: mongoose.Schema.Types.ObjectId, ref: 'Freelancer' }, // asigned freelancer
  estimate_reference: { type: mongoose.Schema.Types.ObjectId, ref: 'Estimate', required: true },
  freelancers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Freelancer' }],
  accountant: { type: mongoose.Schema.Types.ObjectId, ref: 'Allusers', default: null },

  status: {
    type: String,
    enum: ['draft', 'pending', 'assigned', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },

  milestones: [milestoneSchema],

  is_deleted: { type: Boolean, default: false },
  deleted_at: { type: Date }
}, { timestamps: true });

// Auto PROJ-000001
projectSchema.pre('save', async function (next) {
  if (!this.Code) {
    // Get last created project code
    const lastProject = await this.constructor
      .findOne({})
      .sort({ Code: -1 })  // Latest code
      .select('Code')
      .lean();

    let nextNumber = 1;

    if (lastProject && lastProject.Code) {
      const num = parseInt(lastProject.Code.split('-')[1], 10);
      nextNumber = num + 1;
    }

    this.Code = `PROJ-${String(nextNumber).padStart(6, '0')}`;
  }

  next();
});


// Smart status auto-update
projectSchema.pre('save', function (next) {
  const active = this.milestones.filter(m => !m.is_deleted);
  const approved = active.filter(m => m.status === 'approved');

  if (active.length > 0 && approved.length === active.length) {
    this.status = 'completed';
  }
  else if (this.freelancers && this.freelancers.length > 0 && approved.length > 0) {
    this.status = 'in_progress';
  }
  else if (this.freelancers && this.freelancers.length > 0) {
    this.status = 'assigned';
  }
  else {
    this.status = 'pending';
  }

  next();
});

projectSchema.pre(['find', 'findOne', 'findById'], function () {
  this.where({ is_deleted: { $ne: true } });
});

module.exports = mongoose.model('Project_freelancer', projectSchema);