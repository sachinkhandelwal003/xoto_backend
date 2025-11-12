// controllers/freelancer/freelancer.controller.js
const winston = require('winston');
const Freelancer = require('../../models/Freelancer/freelancer.model');
const Category = require('../../models/Freelancer/categoryfreelancer.model');
const Subcategory = require('../../models/Freelancer/subcategoryfreelancer.model');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const asyncHandler = require('../../../../utils/asyncHandler');
const bcrypt = require('bcryptjs');
const { createToken } = require('../../../../middleware/auth');
const { Role } = require('../../models/role/role.model');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.File({ filename: 'logs/freelancer.log' }),
    new winston.transports.Console()
  ]
});

// === LOGIN ===
exports.freelancerLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const freelancer = await Freelancer.findOne({ email }).select('+password').populate('role');

  if (!freelancer || !(await bcrypt.compare(password, freelancer.password))) {
    throw new APIError('Invalid credentials', StatusCodes.UNAUTHORIZED);
  }

  const token = createToken(freelancer);
  const response = freelancer.toObject();
  delete response.password;

  res.status(StatusCodes.OK).json({ success: true, token, freelancer: response });
});

// === CREATE ===
// controllers/freelancer/freelancer.controller.js
// controllers/freelancer/freelancer.controller.js
exports.createFreelancer = asyncHandler(async (req, res) => {
  const data = req.body;

  const existing = await Freelancer.findOne({
    $or: [{ email: data.email }, { mobile: data.mobile }]
  });
  if (existing) throw new APIError('Email or mobile already exists', StatusCodes.CONFLICT);

  if (!data.is_mobile_verified) throw new APIError('Mobile must be verified', StatusCodes.BAD_REQUEST);

  const role = await Role.findOne({ name: 'Freelancer' });
  if (!role) throw new APIError('Role not found', StatusCodes.NOT_FOUND);
  
  // Convert ObjectId to string
  data.role = role._id; // Convert to string
  data.status_info = { status: 0 };
  data.password = await bcrypt.hash(data.password, 10);

  // No document handling here
  data.documents = []; // Initialize empty

  const freelancer = await Freelancer.create(data);
  
  // Populate will still work if you reference the role properly
  await freelancer.populate('role services_offered.category services_offered.subcategory');

  logger.info(`Freelancer registered (pending): ${freelancer._id}`);
  res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Registration successful. Complete your profile after login.",
    freelancer: {
      _id: freelancer._id,
      email: freelancer.email,
      name: freelancer.name,
      status: freelancer.status_info.status,
      role: freelancer.role // This will now be a string
    }
  });
});

// === GET ALL ===
exports.getAllFreelancers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status, search, city, id } = req.query;
  const query = { is_deleted: false };

  // If an ID is provided, return a single freelancer
  if (id) {
    const freelancer = await Freelancer.findOne({ _id: id, is_deleted: false })
      .select('-password')
      .populate('role services_offered.category services_offered.subcategory')
      .lean();

    if (!freelancer) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Freelancer not found',
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      freelancer,
    });
  }

  // Otherwise, fetch all freelancers with filters
  if (status) query['status_info.status'] = parseInt(status);
  if (search)
    query.$or = [
      { 'name.first_name': new RegExp(search, 'i') },
      { 'name.last_name': new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
    ];
  if (city) query['location.city'] = new RegExp(city, 'i');

  const freelancers = await Freelancer.find(query)
    .select('-password')
    .populate('role services_offered.category services_offered.subcategory')
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();

  const total = await Freelancer.countDocuments(query);

  res.status(StatusCodes.OK).json({
    success: true,
    pagination: { page: Number(page), limit: Number(limit), total },
    freelancers,
  });
});


exports.getFreelancerProfile = asyncHandler(async (req, res) => {
  const freelancer = await Freelancer.findById(req.user.id)
    .populate('role services_offered.category services_offered.subcategory')
    .select('-password');

  if (!freelancer) throw new APIError('Freelancer not found', StatusCodes.NOT_FOUND);

  // ================================
  // 🔹 Section-Wise Scoring Logic
  // ================================

  const sections = {
    basic: 0,
    professional: 0,
    location: 0,
    services: 0,
    portfolio: 0,
    payment: 0,
    documents: 0,
    meta: 0,
  };

  // -------- BASIC INFO --------
  let basicFields = 5;
  let basicScore = 0;
  if (freelancer.name?.first_name) basicScore++;
  if (freelancer.name?.last_name) basicScore++;
  if (freelancer.email) basicScore++;
  if (freelancer.mobile && freelancer.is_mobile_verified) basicScore++;
  if (freelancer.profile_image) basicScore++;
  sections.basic = Math.round((basicScore / basicFields) * 100);

  // -------- PROFESSIONAL INFO --------
  let profFields = 5;
  let profScore = 0;
  if (freelancer.professional?.experience_years) profScore++;
  if (freelancer.professional?.bio) profScore++;
  if ((freelancer.professional?.skills?.length ?? 0) > 0) profScore++;
  if (freelancer.professional?.working_radius) profScore++;
  if (freelancer.professional?.availability) profScore++;
  sections.professional = Math.round((profScore / profFields) * 100);

  // -------- LOCATION --------
  let locFields = 4;
  let locScore = 0;
  if (freelancer.location?.city) locScore++;
  if (freelancer.location?.state) locScore++;
  if (freelancer.location?.country) locScore++;
  if (freelancer.location?.pincode) locScore++;
  sections.location = Math.round((locScore / locFields) * 100);

  // -------- SERVICES OFFERED --------
  if ((freelancer.services_offered?.length ?? 0) > 0) {
    // check if each has proper details
    const valid = freelancer.services_offered.filter(
      (s) => s.category && s.subcategory && s.description
    );
    sections.services = Math.round((valid.length / freelancer.services_offered.length) * 100);
  } else sections.services = 0;

  // -------- PORTFOLIO --------
  if ((freelancer.portfolio?.length ?? 0) > 0) {
    const valid = freelancer.portfolio.filter(
      (p) => p.title && p.category && p.subcategory && (p.images?.length ?? 0) > 0
    );
    sections.portfolio = Math.round((valid.length / freelancer.portfolio.length) * 100);
  } else sections.portfolio = 0;

  // -------- PAYMENT INFO --------
  let payFields = 3;
  let payScore = 0;
  if (freelancer.payment?.preferred_method) payScore++;
  if (freelancer.payment?.advance_percentage) payScore++;
  if (freelancer.payment?.gst_number) payScore++;
  sections.payment = Math.round((payScore / payFields) * 100);

  // -------- DOCUMENTS --------
  if ((freelancer.documents?.length ?? 0) > 0) {
    const verifiedDocs = freelancer.documents.filter((d) => d.verified);
    sections.documents = Math.round((verifiedDocs.length / freelancer.documents.length) * 100);
  } else sections.documents = 0;

  // -------- META / AGREEMENT --------
  let metaFields = 2;
  let metaScore = 0;
  if (freelancer.meta?.agreed_to_terms) metaScore++;
  if (freelancer.meta?.portal_access) metaScore++;
  sections.meta = Math.round((metaScore / metaFields) * 100);

  // ================================
  // 🔹 Total Profile Completion
  // ================================
  const totalSections = Object.keys(sections).length;
  const totalScore =
    Object.values(sections).reduce((sum, val) => sum + val, 0) / totalSections;
  const completionPercentage = Math.round(totalScore);

  // ================================
  // 🔹 Response
  // ================================
  res.json({
    success: true,
    freelancer,
    profileProgress: {
      completionPercentage,
      sections,
      remaining: 100 - completionPercentage,
      summary:
        completionPercentage < 100
          ? `Your profile is ${completionPercentage}% complete. Please complete the missing sections.`
          : 'Profile is 100% complete!',
    },
  });
});

// === UPDATE PROFILE (Freelancer himself) ===
exports.updateFreelancerProfile = asyncHandler(async (req, res) => {
  const freelancerId = req.user.id; // logged-in freelancer
  const data = req.body;

  const freelancer = await Freelancer.findById(freelancerId);
  if (!freelancer) throw new APIError('Freelancer not found', StatusCodes.NOT_FOUND);

  // ---- BASIC ----
  if (data.name) {
    freelancer.name.first_name = data.name.first_name?.trim() || freelancer.name.first_name;
    freelancer.name.last_name = data.name.last_name?.trim() || freelancer.name.last_name;
  }
  if (data.mobile) freelancer.mobile = data.mobile.trim();
  if (data.profile_image) freelancer.profile_image = data.profile_image; // path from upload
  if (data.languages) freelancer.languages = data.languages;

  // ---- PROFESSIONAL ----
  if (data.professional) {
    freelancer.professional.experience_years = Number(data.professional.experience_years) || freelancer.professional.experience_years;
    freelancer.professional.bio = data.professional.bio?.trim() || freelancer.professional.bio;
    freelancer.professional.skills = data.professional.skills || freelancer.professional.skills;
    freelancer.professional.working_radius = data.professional.working_radius?.trim() || freelancer.professional.working_radius;
    freelancer.professional.availability = data.professional.availability || freelancer.professional.availability;
  }

  // ---- LOCATION ----
  if (data.location) {
    freelancer.location.city = data.location.city?.trim() || freelancer.location.city;
    freelancer.location.state = data.location.state?.trim() || freelancer.location.state;
    freelancer.location.country = data.location.country?.trim() || freelancer.location.country;
    freelancer.location.pincode = data.location.pincode?.trim() || freelancer.location.pincode;
  }

  // ---- PAYMENT ----
  if (data.payment) {
    freelancer.payment.preferred_method = data.payment.preferred_method?.trim() || freelancer.payment.preferred_method;
    freelancer.payment.advance_percentage = Number(data.payment.advance_percentage) || freelancer.payment.advance_percentage;
    freelancer.payment.gst_number = data.payment.gst_number?.trim() || freelancer.payment.gst_number;
  }

  // ---- SERVICES OFFERED ----
  if (Array.isArray(data.services_offered)) {
    freelancer.services_offered = data.services_offered.map(s => ({
      category: s.category,
      subcategory: s.subcategory,
      description: s.description?.trim(),
      price_range: s.price_range?.trim(),
      unit: s.unit?.trim(),
      images: s.images || [],
      is_active: s.is_active ?? true,
    }));
  }

  // ---- PORTFOLIO ----
  if (Array.isArray(data.portfolio)) {
    freelancer.portfolio = data.portfolio.map(p => ({
      title: p.title?.trim(),
      category: p.category,
      subcategory: p.subcategory,
      description: p.description?.trim(),
      images: p.images || [],
      area: p.area?.trim(),
      duration: p.duration?.trim(),
      client_name: p.client_name?.trim(),
      completed_at: p.completed_at ? new Date(p.completed_at) : undefined,
      featured: p.featured ?? false,
    }));
  }

  // ---- GALLERY ----
  if (Array.isArray(data.gallery)) {
    freelancer.gallery = data.gallery;
  }

  // ---- META ----
  if (data.meta?.agreed_to_terms !== undefined) {
    freelancer.meta.agreed_to_terms = Boolean(data.meta.agreed_to_terms);
  }

  // ---- CHANGE HISTORY ----
  freelancer.meta.change_history = freelancer.meta.change_history || [];
  freelancer.meta.change_history.push({
    updated_by: req.user._id,
    changes: ['Profile updated by freelancer'],
    updated_at: new Date(),
  });

  await freelancer.save();
  await freelancer.populate('role services_offered.category services_offered.subcategory');

  res.json({ success: true, message: 'Profile updated', freelancer });
});

// === UPLOAD / RE-UPLOAD DOCUMENT ===
exports.updateDocument = asyncHandler(async (req, res) => {
  const { documentId } = req.params;
  if (!req.file) throw new APIError('File is required', StatusCodes.BAD_REQUEST);

  const freelancer = await Freelancer.findById(req.user.id);
  if (!freelancer) throw new APIError('Freelancer not found', StatusCodes.NOT_FOUND);

  const doc = freelancer.documents.id(documentId);
  if (!doc) throw new APIError('Document not found', StatusCodes.NOT_FOUND);
  if (doc.verified) throw new APIError('Verified document cannot be changed', StatusCodes.FORBIDDEN);

  doc.path = req.file.path;
  doc.uploaded_at = new Date();

  // change history
  freelancer.meta.change_history = freelancer.meta.change_history || [];
  freelancer.meta.change_history.push({
    updated_by: req.user._id,
    changes: [`Document ${doc.type} re-uploaded`],
    updated_at: new Date(),
  });

  await freelancer.save();

  res.json({
    success: true,
    message: 'Document updated',
    document: doc,
  });
});

// === ADMIN: UPDATE DOCUMENT VERIFICATION ===
exports.updateDocumentVerification = asyncHandler(async (req, res) => {
  const { freelancerId, documentId, verified, reason, suggestion } = req.body;

  const freelancer = await Freelancer.findById(freelancerId);
  if (!freelancer) throw new APIError('Freelancer not found', StatusCodes.NOT_FOUND);

  const doc = freelancer.documents.id(documentId);
  if (!doc) throw new APIError('Document not found', StatusCodes.NOT_FOUND);

  doc.verified = Boolean(verified);
  doc.reason = verified ? null : (reason || 'Invalid document');
  doc.suggestion = verified ? null : (suggestion || 'Please re-upload correct file');

  freelancer.meta.change_history = freelancer.meta.change_history || [];
  freelancer.meta.change_history.push({
    updated_by: req.user._id,
    changes: [`Document ${doc.type} ${verified ? 'APPROVED' : 'REJECTED'}`],
    updated_at: new Date(),
  });

  await freelancer.save();

  res.json({
    success: true,
    message: verified ? 'Document approved' : 'Document rejected',
    document: doc,
  });
});
// === UPDATE STATUS ===
exports.updateFreelancerStatus = asyncHandler(async (req, res) => {
  const { status, rejection_reason } = req.body;
  const freelancer = await Freelancer.findById(req.params.id);
  if (!freelancer) throw new APIError('Not found', StatusCodes.NOT_FOUND);

  freelancer.status_info.status = status;
  if (status == 1) {
    freelancer.status_info.approved_at = new Date();
    freelancer.status_info.approved_by = req.user._id;
  } else if (status == 2) {
    freelancer.status_info.rejection_reason = rejection_reason;
  }

  // ✅ Safe check for change_history
  if (!freelancer.meta.change_history) {
    freelancer.meta.change_history = [];
  }

  freelancer.meta.change_history.push({
    updated_by: req.user._id,
    changes: [`Status → ${status}`],
    updated_at: new Date()
  });

  await freelancer.save();

  res.json({ success: true, status_info: freelancer.status_info });
});


// === SOFT DELETE ===
exports.deleteFreelancer = asyncHandler(async (req, res) => {
  const freelancer = await Freelancer.findById(req.params.id);
  if (!freelancer) throw new APIError('Not found', StatusCodes.NOT_FOUND);

  freelancer.is_deleted = true;
  freelancer.deleted_at = new Date();
  freelancer.meta.change_history.push({
    updated_by: req.user._id,
    changes: ['Soft deleted']
  });
  await freelancer.save();

  res.json({ success: true, message: 'Deleted' });
});