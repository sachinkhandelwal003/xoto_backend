  // validations/freelancer/projectfreelancer.validation.js
  const { body, param, validationResult } = require('express-validator');
  const mongoose = require('mongoose');
  const path = require('path');
  const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const Project = require('../../models/Freelancer/projectfreelancer.model');

  // ──────────────────────────────────────────────────────────────
  //  REUSABLE VALIDATION HANDLER
  // ──────────────────────────────────────────────────────────────
  const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array().map(err => ({
          field: err.path || err.param,
          message: err.msg
        }))
      });
    }
    next();
  };

  // ───────────────────────────────   ──────────────────────────────
  //  HELPER: Valid ObjectId
  // ──────────────────────────────────────────────────────────────
  const isValidObjectId = (value, fieldName) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      throw new Error(`${fieldName} must be a valid MongoDB ObjectId`);
    }
    return true;
  };

  // ──────────────────────────────────────────────────────────────
  //  MILESTONE VALIDATOR (Reusable) - SAFE SANITIZER
  // ──────────────────────────────────────────────────────────────
 // ──────────────────────────────────────────────────────────────
//  MILESTONE VALIDATOR (Reusable) – ONLY REQUIRED FIELDS
// ──────────────────────────────────────────────────────────────
const milestoneValidator = [
  body('milestones')
    .optional()
    .customSanitizer(value => {
      // form-data → string → parse safely
      if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return 'INVALID_JSON'; }
      }
      return Array.isArray(value) ? value : [];
    })
    .custom(value => {
      if (value === 'INVALID_JSON') throw new Error('Invalid JSON in milestones');
      if (!Array.isArray(value)) throw new Error('milestones must be an array');
      return true;
    }),

  // ---- REQUIRED per milestone ------------------------------------------------
  body('milestones.*.title')
    .notEmpty().withMessage('Milestone title is required')
    .isLength({ min: 2 }).withMessage('Title too short'),

  body('milestones.*.start_date')
    .isISO8601().withMessage('Valid ISO start_date required'),

  body('milestones.*.end_date')
    .isISO8601().withMessage('Valid ISO end_date required'),

  body('milestones.*.amount')
    .isFloat({ min: 0 }).withMessage('Amount must be ≥ 0'),

  // ---- OPTIONAL -------------------------------------------------------------
  body('milestones.*.description')
    .optional().isString().trim(),

  // ---- DUE DATE – will be filled later in controller -------------------------
  body('milestones.*.due_date')
    .optional().isISO8601().withMessage('due_date must be ISO if provided'),
];
  // ──────────────────────────────────────────────────────────────
  //  CREATE PROJECT VALIDATION
  // ──────────────────────────────────────────────────────────────
  exports.validateCreateProject = [
    // Required
    body('title').notEmpty().bail().withMessage('Project title is required').isLength({ min: 3 }),
    body('client_name').notEmpty().bail().withMessage('Client name is required'),
    body('project_type').isIn(['Residential', 'Commercial', 'Public', 'Resort', 'Urban', 'Other']).bail(),
    body('address').notEmpty().bail().withMessage('Address is required'),
    body('city').notEmpty().bail().withMessage('City is required'),
    body('start_date').isISO8601().bail().withMessage('Valid start_date required'),
    body('end_date').isISO8601().bail().withMessage('Valid end_date required'),
    body('budget').isFloat({ min: 0 }).bail().withMessage('Budget must be ≥ 0'),
    body('category').custom(value => isValidObjectId(value, 'Category ID')).bail(),
    body('subcategory').custom(value => isValidObjectId(value, 'Subcategory ID')).bail(),
  body('customer')
    .optional({ nullable: true })
    .customSanitizer(value => (value === '' ? null : value))
    .custom(value => {
      if (value === null) return true;
      if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new Error('Customer ID must be a valid MongoDB ObjectId');
      }
      return true;
    }),

    // Optional
    body('client_company').optional().isString(),
    body('project_duration').optional().isString(),
    body('gps_coordinates.latitude').optional().isFloat(),
    body('gps_coordinates.longitude').optional().isFloat(),
    body('overview').optional().isString(),
    body('design_concept').optional().isString(),
    body('scope_details').optional().isString(),
    body('landscape_architect').optional().isString(),
    body('planting_plan').optional().isString(),
    body('material_specifications').optional().isString(),
    body('irrigation_plan').optional().isString(),
    body('lighting_plan').optional().isString(),
    body('site_area.value').optional().isFloat({ min: 0 }),
    body('site_area.unit').optional().isIn(['sq_ft', 'sq_m']),
    body('payment_terms').optional().isString(),
    body('project_schedule').optional().isString(),
    body('safety_guidelines').optional().isString(),
    body('environmental_compliance').optional().isString(),
    body('waste_disposal_plan').optional().isString(),

    // Work Scope Booleans
    body('work_scope.softscaping').optional().toBoolean(),
    body('work_scope.hardscaping').optional().toBoolean(),
    body('work_scope.irrigation_systems').optional().toBoolean(),
    body('work_scope.lighting_design').optional().toBoolean(),
    body('work_scope.water_features').optional().toBoolean(),
    body('work_scope.furniture_accessories').optional().toBoolean(),
    body('work_scope.maintenance_plan').optional().toBoolean(),

    // Arrays
    body('team_members').optional().isArray(),
    body('team_members.*.name').optional().isString(),
    body('team_members.*.role').optional().isString(),
    body('team_members.*.contact').optional().isString(),

    body('machinery_equipment').optional().isArray(),
    body('materials_list').optional().isArray(),
    body('materials_list.*.item').optional().isString(),
    body('materials_list.*.quantity').optional().isFloat({ min: 0 }),
    body('materials_list.*.unit').optional().isString(),
    body('materials_list.*.supplier').optional().isString(),

    body('suppliers').optional().isArray(),
    body('manpower_allocation').optional().isString(),

    body('cost_breakdown.materials').optional().toFloat(),
    body('cost_breakdown.labor').optional().toFloat(),
    body('cost_breakdown.equipment').optional().toFloat(),
    body('cost_breakdown.overheads').optional().toFloat(),
    body('cost_breakdown.contingency').optional().toFloat(),

    // Milestones
    ...milestoneValidator,

    // Permits
    body('permits_approvals').optional().isArray(),
    body('permits_approvals.*.name').optional().isString(),
    body('permits_approvals.*.status').optional().isIn(['pending', 'approved', 'rejected']),

    // FILE VALIDATION
    (req, res, next) => {
      if (!req.files) return next();

      const allowedTypes = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.dwg', '.dxf'];
      const maxSize = 10 * 1024 * 1024;

      const check = (field) => {
        const files = req.files[field];
        if (!files) return;
        const arr = Array.isArray(files) ? files : [files];
        for (const f of arr) {
          const ext = path.extname(f.originalname).toLowerCase();
          if (!allowedTypes.includes(ext)) return { field, message: `Invalid file type: ${ext}` };
          if (f.size > maxSize) return { field, message: 'File too large (max 10MB)' };
        }
        return null;
      };

      const errors = [
        check('drawings_blueprints'),
        check('visualization_3d'),
        check('permits_documents')
      ].filter(Boolean);

      if (errors.length > 0) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: 'Validation failed',
          errors
        });
      }
      next();
    },

    validate
  ];

  // ──────────────────────────────────────────────────────────────
  //  OTHER VALIDATIONS (Safe & Clean)
  // ──────────────────────────────────────────────────────────────
  exports.validateAddMilestone = [
    param('id').custom(value => isValidObjectId(value, 'Project ID')),
    body('title').notEmpty().withMessage('Milestone title is required'),
    body('start_date').isISO8601().withMessage('Valid start_date required'),
    body('end_date').isISO8601().withMessage('Valid end_date required'),
    body('amount').isFloat({ min: 0 }).withMessage('Amount must be ≥ 0'),
    body('due_date').optional().isISO8601(),
    (req, res, next) => {
      const photos = req.files?.photos;
      if (!photos) return next();
      const files = Array.isArray(photos) ? photos : [photos];
      if (files.length > 10) return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'Max 10 photos' });
      for (const f of files) {
        const ext = path.extname(f.originalname).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
          return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'Invalid photo type' });
        }
        if (f.size > 5 * 1024 * 1024) {
          return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'Photo too large' });
        }
      }
      next();
    },
    validate
  ];

  exports.validateDailyUpdate = [
  param('id').custom(value => isValidObjectId(value, 'Project ID')),
  param('milestoneId').custom(value => isValidObjectId(value, 'Milestone ID')),

  body('work_done')
    .notEmpty().withMessage('work_done is required')
    .isLength({ min: 5 }).withMessage('work_done must be at least 5 characters'),

  body('date')
    .optional()
    .isISO8601().withMessage('Invalid date format (must be ISO8601)'),

  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id, milestoneId } = req.params;
    const { date } = req.body;

    try {
      const project = await Project.findOne({
        _id: id,
        is_deleted: false,
        "milestones._id": milestoneId
      });

      if (!project) {
        return res.status(404).json({ success: false, message: "Project or milestone not found" });
      }

      const milestone = project.milestones.id(milestoneId);

      if (date) {
        const d = new Date(date);
        const start = new Date(milestone.start_date);
        const end = new Date(milestone.end_date);

        if (d < start || d > end) {
          return res.status(400).json({
            success: false,
            message: `Daily update date must be between milestone start (${start.toDateString()}) and end (${end.toDateString()})`
          });
        }
      }

      // Attach for controller
      req.milestone = milestone;
      req.project = project;
      next();

    } catch (err) {
      console.error("Validation error:", err);
      return res.status(500).json({ success: false, message: "Validation failed", error: err.message });
    }
  }
];

  exports.validateApproveDaily = [
    param('id').custom(value => isValidObjectId(value, 'Project ID')),
    param('milestoneId').custom(value => isValidObjectId(value, 'Milestone ID')),
    param('dailyId').custom(value => isValidObjectId(value, 'Daily Update ID')),
    body('approved_progress').isInt({ min: 0, max: 100 }).withMessage('approved_progress must be 0-100'),
    validate
  ];

  exports.validateAssignFreelancer = [

  // Validate project ID
  param('id').custom(value => isValidObjectId(value, 'Project ID')),

  // freelancers must be an array
  body('freelancers')
    .isArray({ min: 1 })
    .withMessage('freelancers must be a non-empty array'),

  // validate each freelancerId inside array
  body('freelancers.*')
    .custom(value => isValidObjectId(value, 'Freelancer ID')),

  validate
];


  exports.validateProjectId = [param('id').custom(value => isValidObjectId(value, 'Project ID')), validate];
  exports.validateMilestone = [
    param('id').custom(value => isValidObjectId(value, 'Project ID')),
    param('milestoneId').custom(value => isValidObjectId(value, 'Milestone ID')),
    validate
  ];