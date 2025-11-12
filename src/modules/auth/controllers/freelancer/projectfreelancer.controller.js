// controllers/freelancer/projectfreelancer.controller.js
const Project = require('../../models/Freelancer/projectfreelancer.model');
const Freelancer = require('../../models/Freelancer/freelancer.model');
const Accountant=require('../../models/accountant/Accountant.model')
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const asyncHandler = require('../../../../utils/asyncHandler');
const mongoose = require('mongoose');
const logger = require('winston').createLogger({
  level: 'info',
  format: require('winston').format.combine(
    require('winston').format.timestamp(),
    require('winston').format.json()
  ),
  transports: [
    new (require('winston').transports.File)({ filename: 'logs/project.log' }),
    new (require('winston').transports.Console)()
  ]
});// controllers/freelancer/projectfreelancer.controller.js

exports.createProject = asyncHandler(async (req, res) => {
  const {
    title, client_name, client_company, project_type,
    address, city, gps_coordinates, start_date, end_date,
    project_duration, budget,

    overview, site_area, design_concept, work_scope, scope_details,

    landscape_architect, planting_plan, material_specifications,
    irrigation_plan, lighting_plan,

    team_members, machinery_equipment, materials_list, suppliers, manpower_allocation,

    cost_breakdown, payment_terms,

    project_schedule, milestones: rawMilestones = [],

    safety_guidelines, environmental_compliance, waste_disposal_plan,

    category, subcategory, customer
  } = req.body;

  // ── 1. Required Fields (customer REMOVED) ───────────────────────
  const required = {
    title, client_name, project_type, address, city,
    start_date, end_date, budget, category, subcategory
  };
  for (const [k, v] of Object.entries(required)) {
    if (!v) throw new APIError(`${k.replace('_', ' ')} is required`, StatusCodes.BAD_REQUEST);
  }

  // ── 2. Project dates ─────────────────────────────────────────────
  const projectStart = new Date(start_date);
  const projectEnd   = new Date(end_date);
  if (isNaN(projectStart) || isNaN(projectEnd) || projectStart >= projectEnd) {
    throw new APIError('Project start_date must be before end_date', StatusCodes.BAD_REQUEST);
  }

  // ── 3. MILESTONES – use validator result + extra checks ───────
  let milestones = rawMilestones;                // already parsed by validator
  if (!Array.isArray(milestones)) milestones = [];

  const validMilestones = [];
  for (const m of milestones) {
    const {
      title, description = '',
      start_date: ms, end_date: me,
      amount, due_date
    } = m;

    // ---- dates inside project -----------------------------------------
    const msDate = new Date(ms);
    const meDate = new Date(me);
    if (msDate < projectStart || meDate > projectEnd) {
      throw new APIError(`Milestone "${title}" dates must be inside project dates`, StatusCodes.BAD_REQUEST);
    }
    if (msDate >= meDate) {
      throw new APIError(`Milestone "${title}" start_date must be before end_date`, StatusCodes.BAD_REQUEST);
    }

    validMilestones.push({
      title: title.trim(),
      description: description.trim(),
      start_date: msDate,
      end_date: meDate,
      // ---- due_date = project end_date if not supplied -----------------
      due_date: due_date ? new Date(due_date) : projectEnd,
      amount: Number(amount),
      progress: 0,
      status: 'pending'
    });
  }

  // ── 4. File Uploads (unchanged) ───────────────────────────────────
  const drawings_blueprints = req.files?.drawings_blueprints
    ? (Array.isArray(req.files.drawings_blueprints) ? req.files.drawings_blueprints : [req.files.drawings_blueprints])
        .map(f => f.path)
    : [];

  const visualization_3d = req.files?.visualization_3d
    ? (Array.isArray(req.files.visualization_3d) ? req.files.visualization_3d : [req.files.visualization_3d])
        .map(f => f.path)
    : [];

  const permits_documents = req.files?.permits_documents
    ? (Array.isArray(req.files.permits_documents) ? req.files.permits_documents : [req.files.permits_documents])
        .map(f => f.path)
    : [];

  // ── 5. Permits Approvals (unchanged) ──────────────────────────────
  const permits_approvals = [];
  if (req.body.permits_approvals) {
    let permits = req.body.permits_approvals;
    if (typeof permits === 'string') {
      try { permits = JSON.parse(permits); } catch {}
    }
    permits = Array.isArray(permits) ? permits : [permits];

    permits.forEach((p, i) => {
      permits_approvals.push({
        name: p.name || 'Untitled Permit',
        status: p.status || 'pending',
        document: permits_documents[i] || null
      });
    });
  }

  // ── 6. CREATE PROJECT (customer optional) ───────────────────────
  const project = await Project.create({
    title,
    client_name,
    client_company: client_company || '',
    project_type,
    address,
    city,
    gps_coordinates: gps_coordinates ? {
      latitude: Number(gps_coordinates.latitude) || null,
      longitude: Number(gps_coordinates.longitude) || null
    } : {},
    start_date: projectStart,
    end_date: projectEnd,
    project_duration: project_duration || '',
    budget: Number(budget),

    overview: overview || '',
    site_area: site_area ? {
      value: Number(site_area.value) || 0,
      unit: site_area.unit || 'sq_m'
    } : {},
    design_concept: design_concept || '',
    work_scope: work_scope ? {
      softscaping:   work_scope.softscaping   === true || work_scope.softscaping   === 'true',
      hardscaping:   work_scope.hardscaping   === true || work_scope.hardscaping   === 'true',
      irrigation_systems: work_scope.irrigation_systems === true || work_scope.irrigation_systems === 'true',
      lighting_design:    work_scope.lighting_design    === true || work_scope.lighting_design    === 'true',
      water_features:     work_scope.water_features     === true || work_scope.water_features     === 'true',
      furniture_accessories: work_scope.furniture_accessories === true || work_scope.furniture_accessories === 'true',
      maintenance_plan:   work_scope.maintenance_plan   === true || work_scope.maintenance_plan   === 'true'
    } : {
      softscaping: false, hardscaping: false, irrigation_systems: false,
      lighting_design: false, water_features: false, furniture_accessories: false,
      maintenance_plan: false
    },
    scope_details: scope_details || '',

    landscape_architect: landscape_architect || '',
    drawings_blueprints,
    planting_plan: planting_plan || '',
    material_specifications: material_specifications || '',
    irrigation_plan: irrigation_plan || '',
    lighting_plan: lighting_plan || '',
    visualization_3d,

    team_members: Array.isArray(team_members) ? team_members : [],
    machinery_equipment: Array.isArray(machinery_equipment) ? machinery_equipment : [],
    materials_list: Array.isArray(materials_list) ? materials_list.map(m => ({
      item: m.item || '',
      quantity: Number(m.quantity) || 0,
      unit: m.unit || '',
      supplier: m.supplier || ''
    })) : [],
    suppliers: Array.isArray(suppliers) ? suppliers : [],
    manpower_allocation: manpower_allocation || '',

    cost_breakdown: cost_breakdown ? {
      materials: Number(cost_breakdown.materials) || 0,
      labor: Number(cost_breakdown.labor) || 0,
      equipment: Number(cost_breakdown.equipment) || 0,
      overheads: Number(cost_breakdown.overheads) || 0,
      contingency: Number(cost_breakdown.contingency) || 0
    } : { materials: 0, labor: 0, equipment: 0, overheads: 0, contingency: 0 },

    payment_terms: payment_terms || '',
    project_schedule: project_schedule || '',
    milestones: validMilestones,

    permits_approvals,
    safety_guidelines: safety_guidelines || '',
    environmental_compliance: environmental_compliance || '',
    waste_disposal_plan: waste_disposal_plan || '',

    category,
    subcategory,
    customer: customer || null,          // <-- optional, null if omitted
    status: 'draft'
  });

  // ── 7. RESPONSE ───────────────────────────────────────────────────
  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Landscaping project created successfully',
    project: {
      _id: project._id,
      project_id: project.project_id,
      title: project.title,
      client_name: project.client_name,
      project_type: project.project_type,
      status: project.status,
      budget: project.budget,
      milestones_count: project.milestones.length
    }
  });
});
/* GET MILESTONES OF A PROJECT – SECURE & RICH DATA */
exports.getMilestones = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  // 1. VALIDATE PROJECT ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new APIError('Invalid project ID', StatusCodes.BAD_REQUEST);
  }

  // 2. FETCH PROJECT
  const project = await Project.findOne({ _id: id, is_deleted: false })
    .select('milestones start_date end_date title status freelancer customer')
    .populate('freelancer', 'name email')
    .populate('customer', 'name email')
    .lean();

  if (!project) {
    throw new APIError('Project not found', StatusCodes.NOT_FOUND);
  }



  // 4. FILTER & ENRICH MILESTONES
  const activeMilestones = project.milestones
    .filter(m => !m.is_deleted)
    .map(m => ({
      _id: m._id,
      title: m.title,
      description: m.description,
      start_date: m.start_date,
      end_date: m.end_date,
      due_date: m.due_date,
      amount: m.amount,
      progress: m.progress,
      status: m.status,
      daily_updates_count: m.daily_updates.length,
      approved_updates: m.daily_updates.filter(d => d.approval_status === 'approved').length,
      release_requested_at: m.release_requested_at,
      approved_at: m.approved_at
    }));

  // 5. RESPONSE
  res.json({
    success: true,
    project: {
      _id: project._id,
      title: project.title,
      status: project.status
    },
    milestones: activeMilestones,
    summary: {
      total: activeMilestones.length,
      pending: activeMilestones.filter(m => m.status === 'pending').length,
      in_progress: activeMilestones.filter(m => m.status === 'in_progress').length,
      release_requested: activeMilestones.filter(m => m.status === 'release_requested').length,
      approved: activeMilestones.filter(m => m.status === 'approved').length
    }
  });
});
exports.getProjects = asyncHandler(async (req, res) => {
  const { id, page = 1, limit = 10, status, search, freelancer } = req.query;
  const user = req.user;

  // === SINGLE PROJECT BY ID ===
  if (id) {
    const project = await Project.findOne({ _id: id, is_deleted: false })
      .populate('customer', 'name email')
      .populate('freelancer', 'name email mobile')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .select('-__v')
      .lean();

    if (!project) throw new APIError('Project not found', StatusCodes.NOT_FOUND);

    // Access control
    const canAccess =
      ['SuperAdmin', 'Admin'].includes(user.role) ||
      project.customer.toString() === user._id.toString() ||
      (project.freelancer && project.freelancer.toString() === user._id.toString());

    if (!canAccess) throw new APIError('Access denied', StatusCodes.FORBIDDEN);

    return res.json({ success: true, project });
  }

  // === LIST PROJECTS WITH FILTERS ===
  const query = { is_deleted: false };

  // Role-based visibility
  if (user.role === 'Freelancer') {
    query.freelancer = user._id;
  } else if (user.role === 'Customer') {
    query.customer = user._id;
  }
  // SuperAdmin/Admin: no filter → see all

  // Optional filters
  if (status) query.status = status;
  if (search) query.title = { $regex: search.trim(), $options: 'i' };
  if (freelancer && ['SuperAdmin', 'Admin'].includes(user.role)) {
    query.freelancer = freelancer;
  }

  const [projects, total] = await Promise.all([
    Project.find(query)
      .populate('customer', 'name email')
      .populate('freelancer', 'name email mobile')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(+limit)
      .lean(),
    Project.countDocuments(query)
  ]);

  res.json({
    success: true,
    pagination: { page: +page, limit: +limit, total, totalPages: Math.ceil(total / limit) },
    projects
  });
});
/* 2. ADD MILESTONE (Anytime) */
/* 2. ADD MILESTONE – FULLY COMPATIBLE WITH MODEL */
exports.addMilestone = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, description, start_date, end_date, due_date, amount } = req.body;

  // REQUIRED FIELDS
  if (!title || !start_date || !end_date || !amount) {
    throw new APIError('title, start_date, end_date, amount are required', StatusCodes.BAD_REQUEST);
  }

  const amountNum = Number(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    throw new APIError('Amount must be a positive number', StatusCodes.BAD_REQUEST);
  }

  const project = await Project.findOne({ _id: id, is_deleted: false });
  if (!project) throw new APIError('Project not found', StatusCodes.NOT_FOUND);

  const s = new Date(start_date);
  const e = new Date(end_date);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || s >= e) {
    throw new APIError('Invalid or illogical dates', StatusCodes.BAD_REQUEST);
  }

  if (s < new Date(project.start_date) || e > new Date(project.end_date)) {
    throw new APIError(`Milestone must be within project dates`, StatusCodes.BAD_REQUEST);
  }

  let d = e;
  if (due_date && due_date.trim() !== '') {
    d = new Date(due_date);
    if (isNaN(d.getTime())) throw new APIError('Invalid due_date', StatusCodes.BAD_REQUEST);
  }

  // ← PHOTOS (optional)
  const photos = req.files ? req.files.map(f => f.path) : [];

  project.milestones.push({
    title,
    description: description || '',
    start_date: s,
    end_date: e,
    due_date: d,
    amount: amountNum,
    progress: 0,
    status: 'pending',
    photos,                     // ← SAVE PHOTOS
    notes: ''
  });

  await project.save();

  const added = project.milestones[project.milestones.length - 1];

  res.status(StatusCodes.CREATED).json({
    success: true,
    milestone: {
      _id: added._id,
      title: added.title,
      description: added.description,
      start_date: added.start_date,
      end_date: added.end_date,
      due_date: added.due_date,
      amount: added.amount,
      progress: added.progress,
      status: added.status,
      photos: added.photos,     // ← RETURN URLs
      createdAt: added.createdAt
    }
  });
});


/* 3. ASSIGN FREELANCER */
exports.assignFreelancer = asyncHandler(async (req, res) => {
  
  const { id } = req.params;
  const { freelancerId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(freelancerId)) {
    throw new APIError('Invalid freelancer ID', StatusCodes.BAD_REQUEST);
  }

  const project = await Project.findOne({ _id: id, is_deleted: false });
  if (!project) throw new APIError('Not found', StatusCodes.NOT_FOUND);
  if (project.freelancer) throw new APIError('Already assigned', StatusCodes.CONFLICT);

  project.freelancer = freelancerId;
  project.status = 'assigned';
  await project.save();

  res.json({ success: true, message: 'Assigned', project });
});
exports.moveProjectToAccountant = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { accountantId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(accountantId)) {
    throw new APIError('Invalid accountant ID', StatusCodes.BAD_REQUEST);
  }

  const project = await Project.findOne({ _id: id, is_deleted: false });
  if (!project) throw new APIError('Project not found', StatusCodes.NOT_FOUND);
  if (project.accountant) throw new APIError('Accountant already assigned', StatusCodes.CONFLICT);

  project.accountant = accountantId;
  await project.save();

  res.json({ success: true, message: 'Project moved to accountant successfully', project });
});

/* 4. FREELANCER: DAILY UPDATE */
// CONTROLLER
/* 4. FREELANCER: DAILY UPDATE - NO PROGRESS */
/* 4. FREELANCER: DAILY UPDATE - FIXED DATE CHECKING */
exports.addDailyUpdate = asyncHandler(async (req, res) => {
  console.log("========== DAILY UPDATE DEBUG ==========");
  console.log("URL:", req.originalUrl);
  console.log("Params:", req.params);
  console.log("User:", req.user?.email || req.user?._id);
  console.log("Body:", req.body);
  console.log("Files:", req.files?.map(f => f.originalname) || "No files");
  console.log("=========================================");

  const { id, milestoneId } = req.params;
  const { work_done, date, notes } = req.body;
  const freelancerId = req.user?._id;

  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  if (!work_done) {
    return res.status(400).json({ success: false, message: "work_done is required" });
  }

  // Project and milestone were already attached in validator
  const project = req.project;
  const milestone = req.milestone;

  const updateDate = date ? new Date(date) : new Date();
  const photos = req.files ? req.files.map(f => f.path) : [];

  const newUpdate = {
    date: updateDate,
    work_done,
    notes: notes || "",
    photos,
    updated_by: freelancerId,
    approval_status: "pending",
    approved_progress: milestone.progress || 0
  };

  milestone.daily_updates.push(newUpdate);
  if (milestone.status === "pending") milestone.status = "in_progress";

  await project.save();

  const added = milestone.daily_updates[milestone.daily_updates.length - 1];

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Daily update added successfully",
    daily_update: {
      _id: added._id,
      date: added.date,
      work_done: added.work_done,
      notes: added.notes,
      photos: added.photos,
      approval_status: added.approval_status,
      createdAt: added.createdAt
    }
  });
});



/* SUPERADMIN: APPROVE + SET PROGRESS */
exports.approveDailyUpdate = asyncHandler(async (req, res) => {
  const { id, milestoneId, dailyId } = req.params;
  const { approved_progress } = req.body; // REQUIRED



  if (approved_progress == null || approved_progress < 0 || approved_progress > 100) {
    throw new APIError('approved_progress (0-100) is required', StatusCodes.BAD_REQUEST);
  }

  const project = await Project.findOne({ _id: id, 'milestones._id': milestoneId });
  if (!project) throw new APIError('Not found', StatusCodes.NOT_FOUND);

  const milestone = project.milestones.id(milestoneId);
  const daily = milestone.daily_updates.id(dailyId);
  if (!daily) throw new APIError('Daily update not found', StatusCodes.NOT_FOUND);
  if (daily.approval_status !== 'pending') throw new APIError('Already processed', StatusCodes.BAD_REQUEST);

  daily.approval_status = 'approved';
  daily.approved_at = new Date();
  daily.approved_progress = +approved_progress;

  // RECALCULATE MILESTONE PROGRESS FROM LATEST APPROVED
  const approvedUpdates = milestone.daily_updates
    .filter(d => d.approval_status === 'approved')
    .sort((a, b) => b.date - a.date); // latest first

  // In approveDailyUpdate — CORRECT LINE:
milestone.progress = approvedUpdates.length > 0
  ? Math.min(approvedUpdates[0].approved_progress, 100)
  : 0;
  await project.save();

  res.json({
    success: true,
    message: 'Daily update approved',
    milestone: {
      _id: milestone._id,
      progress: milestone.progress,
      status: milestone.status
    }
  });
});
/* NEW: SUPERADMIN REJECT/CHALLENGE DAILY UPDATE */
/* SUPERADMIN: REJECT DAILY UPDATE – CORRECT PROGRESS LOGIC */
exports.rejectDailyUpdate = asyncHandler(async (req, res) => {
  const { id, milestoneId, dailyId } = req.params;
  const { reason } = req.body; // Optional

 
  const project = await Project.findOne({
    _id: id,
    is_deleted: false,
    'milestones._id': milestoneId
  });

  if (!project) throw new APIError('Project or milestone not found', StatusCodes.NOT_FOUND);

  const milestone = project.milestones.id(milestoneId);
  const dailyUpdate = milestone.daily_updates.id(dailyId);

  if (!dailyUpdate) throw new APIError('Daily update not found', StatusCodes.NOT_FOUND);
  if (dailyUpdate.approval_status !== 'pending') {
    throw new APIError('Daily update already processed', StatusCodes.BAD_REQUEST);
  }

  // REJECT
  dailyUpdate.approval_status = 'rejected';
  dailyUpdate.rejected_at = new Date();
  if (reason) dailyUpdate.rejection_reason = reason;

  // RECALCULATE PROGRESS FROM LATEST APPROVED
  const approvedUpdates = milestone.daily_updates
    .filter(u => u.approval_status === 'approved')
    .sort((a, b) => b.date - a.date); // latest first

  milestone.progress = approvedUpdates.length > 0
    ? Math.min(approvedUpdates[0].approved_progress, 100) // USE approved_progress
    : 0;

  await project.save();

  res.json({
    success: true,
    message: 'Daily update rejected',
    milestone: {
      _id: milestone._id,
      progress: milestone.progress,
      status: milestone.status
    },
    rejected_update: {
      _id: dailyUpdate._id,
      rejection_reason: dailyUpdate.rejection_reason,
      rejected_at: dailyUpdate.rejected_at
    }
  });
});
/* 8. FREELANCER – REQUEST PAYMENT RELEASE */
/* 8. FREELANCER – REQUEST PAYMENT RELEASE - FIXED */
exports.requestRelease = asyncHandler(async (req, res) => {
  const { id, milestoneId } = req.params;
  const freelancerId = req.user._id;

  const project = await Project.findOne({
    _id: id,
    is_deleted: false,
    freelancer: freelancerId,
    'milestones._id': milestoneId,
  });

  if (!project) throw new APIError('Access denied', StatusCodes.FORBIDDEN);

  const milestone = project.milestones.id(milestoneId);

  // FIXED: Check if progress is 100 and status allows release
  if (milestone.progress !== 100) {
    throw new APIError('Milestone must be 100% complete to request payment', StatusCodes.BAD_REQUEST);
  }

  // FIXED: Allow release from in_progress or submitted status
  if (!['in_progress', 'submitted', 'pending'].includes(milestone.status)) {
    throw new APIError(`Cannot request payment for milestone with status: ${milestone.status}`, StatusCodes.BAD_REQUEST);
  }

  milestone.status = 'release_requested';
  milestone.release_requested_at = new Date(); // FIXED: Use correct field name
  await project.save();

  res.json({ 
    success: true, 
    message: 'Payment release requested successfully', 
    milestone: {
      _id: milestone._id,
      title: milestone.title,
      status: milestone.status,
      progress: milestone.progress
    }
  });
});

/* 5. SUPERADMIN: VIEW FULL PROJECT + LOGS */
exports.getProjectAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!['SuperAdmin', 'Admin'].includes(req.user.role)) {
    throw new APIError('Unauthorized', StatusCodes.FORBIDDEN);
  }

  const project = await Project.findOne({ _id: id, is_deleted: false })
    .populate('freelancer customer', 'name email mobile')
    .lean();

  if (!project) throw new APIError('Not found', StatusCodes.NOT_FOUND);

  const active = project.milestones.filter(m => !m.is_deleted);
  const progress = active.length > 0
    ? Math.round(active.filter(m => m.status === 'approved').length / active.length * 100)
    : 0;

  res.json({
    success: true,
    project,
    progress: { total: active.length, approved: active.filter(m => m.status === 'approved').length, percentage: progress },
    daily_logs: active.flatMap(m => m.daily_updates.map(d => ({
      milestone: m.title,
      date: d.date,
      progress: d.progress,
      work_done: d.work_done
    })))
  });
});


exports.approveMilestone = asyncHandler(async (req, res) => {
  const { id, milestoneId } = req.params;

  // Find project first
  const project = await Project.findOne({ _id: id, is_deleted: false });
  if (!project) {
    throw new APIError('Project not found', StatusCodes.NOT_FOUND);
  }

  // Find milestone within the project
  const milestone = project.milestones.id(milestoneId);
  if (!milestone) {
    throw new APIError('Milestone not found', StatusCodes.NOT_FOUND);
  }

  // Check milestone status
  if (milestone.status !== 'release_requested') {
    throw new APIError(
      `Milestone cannot be approved because it is currently '${milestone.status}'`,
      StatusCodes.BAD_REQUEST
    );
  }

  // Approve milestone
  milestone.status = 'approved';
  milestone.approved_at = new Date();

  // Optionally: update project overall progress
  const totalMilestones = project.milestones.filter((m) => !m.is_deleted).length;
  const approvedMilestones = project.milestones.filter(
    (m) => m.status === 'approved' && !m.is_deleted
  ).length;

  project.overall_progress = totalMilestones
    ? Math.round((approvedMilestones / totalMilestones) * 100)
    : 0;

  await project.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Milestone approved successfully',
    milestone,
    project_progress: project.overall_progress,
  });
});

// src/controllers/freelancer/project.controller.js
/* GET DAILY UPDATES OF A MILESTONE – SECURE & RICH */
/* GET DAILY UPDATES – FIXED FOR .lean() */
exports.getDailyUpdates = asyncHandler(async (req, res) => {
  const { id, milestoneId } = req.params;
  const user = req.user;

  // 1️⃣ VALIDATE IDs
  if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(milestoneId)) {
    throw new APIError("Invalid ID", StatusCodes.BAD_REQUEST);
  }

  // 2️⃣ FETCH PROJECT
  const project = await Project.findOne({
    _id: id,
    is_deleted: false,
  })
    .select("milestones freelancer customer title status")
    .populate("freelancer", "name email")
    .populate("customer", "name email")
    .lean();

  if (!project) {
    throw new APIError("Project not found", StatusCodes.NOT_FOUND);
  }

  // 3️⃣ FIND MILESTONE
  const milestone = project.milestones.find((m) => m._id.toString() === milestoneId);

  if (!milestone) {
    throw new APIError("Milestone not found", StatusCodes.NOT_FOUND);
  }

  // 4️⃣ POPULATE updated_by (on full project doc)
  await Project.populate(project, {
    path: "milestones.daily_updates.updated_by",
    select: "name email avatar",
  });

  // 5️⃣ ENRICH DAILY UPDATES (✅ added photos)
  const enrichedUpdates = milestone.daily_updates
    .map((d) => ({
      _id: d._id,
      date: d.date,
      work_done: d.work_done,
      photos: (d.photos || []).map((p) => p.replace(/\\/g, "/")), // ✅ FIXED HERE
      approved_progress: d.approved_progress,
      approval_status: d.approval_status,
      approved_at: d.approved_at,
      rejected_at: d.rejected_at,
      rejection_reason: d.rejection_reason,
      updated_by: {
        _id: d.updated_by?._id,
        name: d.updated_by?.name,
        email: d.updated_by?.email,
        avatar: d.updated_by?.avatar,
      },
      createdAt: d.createdAt,
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // 6️⃣ RESPONSE
  res.json({
    success: true,
    milestone: {
      _id: milestone._id,
      title: milestone.title,
      progress: milestone.progress,
      status: milestone.status,
    },
    daily_updates: enrichedUpdates,
    summary: {
      total: enrichedUpdates.length,
      approved: enrichedUpdates.filter((d) => d.approval_status === "approved").length,
      rejected: enrichedUpdates.filter((d) => d.approval_status === "rejected").length,
      pending: enrichedUpdates.filter((d) => d.approval_status === "pending").length,
    },
  });
});

/* 7. FREELANCER: MY PROJECTS */
// ✅ Get my projects (freelancer) with pagination and logging
/* 7. FREELANCER: MY PROJECTS - IMPROVED */
exports.getMyProjects = asyncHandler(async (req, res) => {
  /* --------------------------------------------------------------
     1. LOG THE USER OBJECT (helps you see what protectMulti attached)
     -------------------------------------------------------------- */
  console.log('req.user in getMyProjects:', {
    _id: req.user?._id,
    id: req.user?.id,
    role: req.user?.role,
    model: req.user?.constructor?.modelName,
  });

  /* --------------------------------------------------------------
     2. SAFELY EXTRACT THE USER ID
        • protectMulti always puts the Mongo _id on req.user._id
        • fallback to req.user.id (some old tokens)
     -------------------------------------------------------------- */
  const userId = req.user?._id || req.user?.id;

  if (!userId) {
    console.error('No user ID in request');
    return res.status(StatusCodes.UNAUTHORIZED).json({
      success: false,
      message: 'User ID not found – invalid token',
    });
  }

  /* --------------------------------------------------------------
     3. READ QUERY PARAMS (pagination + optional status filter)
     -------------------------------------------------------------- */
  const { page = 1, limit = 10, status } = req.query;
  const skip = (page - 1) * limit;

  /* --------------------------------------------------------------
     4. BUILD THE MONGO QUERY
        • `freelancer` field must contain the freelancer’s ObjectId
        • `is_deleted` is false (soft-delete)
        • optional status filter (ignore "all")
     -------------------------------------------------------------- */
  const query = {
    freelancer: userId,
    is_deleted: false,
  };

  if (status && status !== 'all') {
    query.status = status;
  }

  /* --------------------------------------------------------------
     5. FETCH DATA + TOTAL COUNT IN PARALLEL
     -------------------------------------------------------------- */
  const [projects, total] = await Promise.all([
    Project.find(query)
      .populate('customer', 'name email')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .select(
        'title description status budget deadline milestones overall_progress createdAt'
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(+limit)
      .lean(),

    Project.countDocuments(query),
  ]);

  console.log(`Found ${projects.length} projects (page ${page})`);

  /* --------------------------------------------------------------
     6. ENRICH EACH PROJECT WITH MILESTONE STATS
     -------------------------------------------------------------- */
  const projectsWithStats = projects.map((project) => {
    const activeMilestones = (project.milestones || []).filter(
      (m) => !m.is_deleted
    );
    const completedMilestones = activeMilestones.filter(
      (m) => m.status === 'approved'
    );

    const progress =
      activeMilestones.length > 0
        ? Math.round(
            (completedMilestones.length / activeMilestones.length) * 100
          )
        : 0;

    return {
      ...project,
      milestones_count: activeMilestones.length,
      completed_milestones: completedMilestones.length,
      progress_percentage: progress,
    };
  });

  /* --------------------------------------------------------------
     7. SEND RESPONSE
     -------------------------------------------------------------- */
  res.status(StatusCodes.OK).json({
    success: true,
    pagination: {
      page: +page,
      limit: +limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    projects: projectsWithStats,
  });
});

exports.getMyProjectsAccountant = asyncHandler(async (req, res) => {
  /* --------------------------------------------------------------
     1. LOG THE USER OBJECT (helps you see what protectMulti attached)
     -------------------------------------------------------------- */
  console.log('req.user in getMyProjects:', {
    _id: req.user?._id,
    id: req.user?.id,
    role: req.user?.role,
    model: req.user?.constructor?.modelName,
  });

  /* --------------------------------------------------------------
     2. SAFELY EXTRACT THE USER ID
        • protectMulti always puts the Mongo _id on req.user._id
        • fallback to req.user.id (some old tokens)
     -------------------------------------------------------------- */
  const userId = req.user?._id || req.user?.id;

  if (!userId) {
    console.error('No user ID in request');
    return res.status(StatusCodes.UNAUTHORIZED).json({
      success: false,
      message: 'User ID not found – invalid token',
    });
  }

  /* --------------------------------------------------------------
     3. READ QUERY PARAMS (pagination + optional status filter)
     -------------------------------------------------------------- */
  const { page = 1, limit = 10, status } = req.query;
  const skip = (page - 1) * limit;

  /* --------------------------------------------------------------
     4. BUILD THE MONGO QUERY
        • `freelancer` field must contain the freelancer’s ObjectId
        • `is_deleted` is false (soft-delete)
        • optional status filter (ignore "all")
     -------------------------------------------------------------- */
  const query = {
    accountant: userId,
    is_deleted: false,
  };

  if (status && status !== 'all') {
    query.status = status;
  }

  /* --------------------------------------------------------------
     5. FETCH DATA + TOTAL COUNT IN PARALLEL
     -------------------------------------------------------------- */
  const [projects, total] = await Promise.all([
    Project.find(query)
      .populate('customer', 'name email')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .select(
        'title description status budget deadline milestones overall_progress createdAt'
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(+limit)
      .lean(),

    Project.countDocuments(query),
  ]);

  console.log(`Found ${projects.length} projects (page ${page})`);

  /* --------------------------------------------------------------
     6. ENRICH EACH PROJECT WITH MILESTONE STATS
     -------------------------------------------------------------- */
  const projectsWithStats = projects.map((project) => {
    const activeMilestones = (project.milestones || []).filter(
      (m) => !m.is_deleted
    );
    const completedMilestones = activeMilestones.filter(
      (m) => m.status === 'approved'
    );

    const progress =
      activeMilestones.length > 0
        ? Math.round(
            (completedMilestones.length / activeMilestones.length) * 100
          )
        : 0;

    return {
      ...project,
      milestones_count: activeMilestones.length,
      completed_milestones: completedMilestones.length,
      progress_percentage: progress,
    };
  });

  /* --------------------------------------------------------------
     7. SEND RESPONSE
     -------------------------------------------------------------- */
  res.status(StatusCodes.OK).json({
    success: true,
    pagination: {
      page: +page,
      limit: +limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    projects: projectsWithStats,
  });
});

exports.getProjectsByFreelancerId = asyncHandler(async (req, res) => {
  const { freelancerId, page = 1, limit = 10, status } = req.query;

  if (!freelancerId) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: 'Freelancer ID is required in query',
    });
  }

  // Validate freelancer exists
  const freelancerExists = await Freelancer.findById(freelancerId);
  if (!freelancerExists) {
    return res.status(StatusCodes.NOT_FOUND).json({
      success: false,
      message: 'Freelancer not found',
    });
  }

  const skip = (page - 1) * limit;

  // Build query
  const query = { freelancer: freelancerId, is_deleted: false };
  if (status && status !== 'all') query.status = status;

  // Fetch projects and total count
  const [projects, total] = await Promise.all([
    Project.find(query)
      .populate('customer', 'name email')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .select(
        'title description status budget deadline milestones overall_progress createdAt'
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(+limit)
      .lean(),

    Project.countDocuments(query),
  ]);

  // Compute milestone stats
  const projectsWithStats = projects.map((project) => {
    const activeMilestones = (project.milestones || []).filter((m) => !m.is_deleted);
    const completedMilestones = activeMilestones.filter((m) => m.status === 'approved');

    return {
      ...project,
      milestones_count: activeMilestones.length,
      completed_milestones: completedMilestones.length,
      progress_percentage:
        activeMilestones.length > 0
          ? Math.round((completedMilestones.length / activeMilestones.length) * 100)
          : 0,
    };
  });

  res.status(StatusCodes.OK).json({
    success: true,
    pagination: {
      page: +page,
      limit: +limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    projects: projectsWithStats,
  });
});