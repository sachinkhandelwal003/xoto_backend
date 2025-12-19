// controllers/freelancer/freelancer.controller.js
const winston = require('winston');
const Freelancer = require('../../models/Freelancer/freelancer.model');
const mongoose = require('mongoose');

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

  // Find freelancer and include password
  const freelancer = await Freelancer.findOne({ email })
    .select('+password')
    .populate('role');

  if (!freelancer) {
    return res.status(StatusCodes.UNAUTHORIZED).json({
      success: false,
      message: 'Invalid credentials',
    });
  }

  // Compare password
  const isMatch = await bcrypt.compare(password, freelancer.password);
  if (!isMatch) {
    return res.status(StatusCodes.UNAUTHORIZED).json({
      success: false,
      message: 'Invalid credentials',
    });
  }

  // Create token
  const token = createToken(freelancer);

  // Prepare response (without password)
  const freelancerData = freelancer.toObject();
  delete freelancerData.password;

  res.status(StatusCodes.OK).json({
    success: true,
    token,
    freelancer: freelancerData,
  });
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
// controllers/freelancer/freelancer.controller.js

await freelancer.populate([
  'role',
  'services_offered.category',
  'services_offered.subcategories' // ← Updated path
]);
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


exports.getAllFreelancers = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit,
    status,
    search,
    city,
    isActive,
    freelancerId
  } = req.query;

  /* =====================================================
     1️⃣ SINGLE FREELANCER BY ID
  ===================================================== */
  if (freelancerId) {
    if (!mongoose.Types.ObjectId.isValid(freelancerId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Invalid freelancer ID',
      });
    }

    const freelancer = await Freelancer.findById(freelancerId)
      .select('-password')
      .populate('role', 'name')
      .populate('services_offered.category', 'name slug icon')
      .populate('services_offered.subcategories', 'name slug')
      .populate('portfolio.category', 'name slug')
      .populate('portfolio.subcategory', 'name slug')
      .populate('payment.preferred_currency', 'name code symbol')
      .populate('status_info.approved_by status_info.rejected_by', 'name email')
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

  /* =====================================================
     2️⃣ FILTERS
  ===================================================== */
  const query = {};

  // Status: 0=Pending, 1=Approved, 2=Rejected
  if (status !== undefined) {
    query['status_info.status'] = Number(status);
  }

  // ✅ Active / Inactive
  if (isActive !== undefined) {
    query.isActive = isActive === 'true';
  }

  // Search (name / email / mobile)
  if (search) {
    query.$or = [
      { 'name.first_name': { $regex: search, $options: 'i' } },
      { 'name.last_name': { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { 'mobile.number': { $regex: search, $options: 'i' } },
    ];
  }

  // City
  if (city) {
    query['location.city'] = { $regex: city, $options: 'i' };
  }

  /* =====================================================
     3️⃣ BASE QUERY
  ===================================================== */
  let freelancersQuery = Freelancer.find(query)
    .select('-password')
    .populate('role', 'name')
    .populate('services_offered.category', 'name slug')
    .populate('services_offered.subcategories', 'name slug')
    .populate('payment.preferred_currency', 'code symbol')
    .sort({ createdAt: -1 });

  let pagination = null;

  /* =====================================================
     4️⃣ PAGINATION (OPTIONAL)
  ===================================================== */
  if (limit) {
    const pageNum = Math.max(Number(page), 1);
    const limitNum = Math.max(Number(limit), 1);

    freelancersQuery = freelancersQuery
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const total = await Freelancer.countDocuments(query);

    pagination = {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    };
  }

  /* =====================================================
     5️⃣ EXECUTE QUERY
  ===================================================== */
  const freelancers = await freelancersQuery.lean();

  res.status(StatusCodes.OK).json({
    success: true,
    freelancers,
    pagination, // null if limit not provided
  });
});


// === GET FREELANCER PROFILE (LOGGED-IN USER) ===
exports.getFreelancerProfile = asyncHandler(async (req, res) => {
  const freelancer = await Freelancer.findById(req.user.id)
    .select('-password')
    .populate('role', 'name')
    .populate('services_offered.category', 'name slug icon')
    .populate('services_offered.subcategories', 'name slug')
    .populate('portfolio.category', 'name slug')
    .populate('portfolio.subcategory', 'name slug')
     .populate('payment.preferred_currency', 'name code symbol')
    .lean();

  if (!freelancer) {
    throw new APIError('Freelancer not found', StatusCodes.NOT_FOUND);
  }

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
  const basicFields = 5;
  let basicScore = 0;

  if (freelancer.name?.first_name) basicScore++;
  if (freelancer.name?.last_name) basicScore++;
  if (freelancer.email) basicScore++;
  if (freelancer.mobile?.number && freelancer.is_mobile_verified) basicScore++;
  if (freelancer.profile_image) basicScore++;

  sections.basic = Math.round((basicScore / basicFields) * 100);

  // -------- PROFESSIONAL INFO --------
  const profFields = 5;
  let profScore = 0;

  if (freelancer.professional?.experience_years >= 0) profScore++;
  if (freelancer.professional?.bio) profScore++;
  if ((freelancer.professional?.skills?.length ?? 0) > 0) profScore++;
  if (freelancer.professional?.working_radius) profScore++;
  if (freelancer.professional?.availability) profScore++;

  sections.professional = Math.round((profScore / profFields) * 100);

  // -------- LOCATION --------
  const locFields = 4;
  let locScore = 0;

  if (freelancer.location?.city) locScore++;
  if (freelancer.location?.state) locScore++;
  if (freelancer.location?.country) locScore++;
  if (freelancer.location?.pincode) locScore++;

  sections.location = Math.round((locScore / locFields) * 100);

  // -------- SERVICES OFFERED --------
  if ((freelancer.services_offered?.length ?? 0) > 0) {
    const validServices = freelancer.services_offered.filter(
      s =>
        s.category &&
        (s.subcategories?.length ?? 0) > 0 &&
        s.description
    );
    sections.services = Math.round(
      (validServices.length / freelancer.services_offered.length) * 100
    );
  }

  // -------- PORTFOLIO --------
  if ((freelancer.portfolio?.length ?? 0) > 0) {
    const validPortfolio = freelancer.portfolio.filter(
      p =>
        p.title &&
        p.category &&
        p.subcategory &&
        (p.images?.length ?? 0) > 0
    );
    sections.portfolio = Math.round(
      (validPortfolio.length / freelancer.portfolio.length) * 100
    );
  }

  // -------- PAYMENT --------
  const payFields = 3;
  let payScore = 0;

  if (freelancer.payment?.preferred_method) payScore++;
  if (freelancer.payment?.advance_percentage !== undefined) payScore++;
  if (freelancer.payment?.gst_number) payScore++;

  sections.payment = Math.round((payScore / payFields) * 100);

  // -------- DOCUMENTS --------
  if ((freelancer.documents?.length ?? 0) > 0) {
    const verifiedDocs = freelancer.documents.filter(d => d.verified);
    sections.documents = Math.round(
      (verifiedDocs.length / freelancer.documents.length) * 100
    );
  }

  // -------- META --------
  const metaFields = 2;
  let metaScore = 0;

  if (freelancer.meta?.agreed_to_terms) metaScore++;
  if (freelancer.meta?.portal_access) metaScore++;

  sections.meta = Math.round((metaScore / metaFields) * 100);

  // ================================
  // 🔹 TOTAL PROFILE COMPLETION
  // ================================
  const totalScore =
    Object.values(sections).reduce((sum, val) => sum + val, 0) /
    Object.keys(sections).length;

  const completionPercentage = Math.round(totalScore);

  // ================================
  // 🔹 RESPONSE
  // ================================
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Profile fetched successfully',
    freelancer,
    profileProgress: {
      completionPercentage,
      remaining: 100 - completionPercentage,
      sections,
      summary:
        completionPercentage < 100
          ? `Your profile is ${completionPercentage}% complete. Please complete the missing sections.`
          : 'Profile is 100% complete!',
    },
  });
});


// === UPDATE PROFILE (Freelancer himself) ===
// controllers/freelancer.controller.js

// controllers/freelancer/freelancer.controller.js

exports.updateFreelancerProfile = asyncHandler(async (req, res) => {
  const freelancerId = req.user?.id || req.user?._id;

  if (!freelancerId) {
    throw new APIError('Unauthorized', StatusCodes.UNAUTHORIZED);
  }

  // When using FormData, req.body contains text fields, req.files contains files
  let data = req.body;
  const freelancer = await Freelancer.findById(freelancerId);

  if (!freelancer) {
    throw new APIError('Freelancer not found', StatusCodes.NOT_FOUND);
  }

  // --- HELPER: Parse JSON strings from FormData ---
  // FormData turns nested objects/arrays into strings. We must parse them back.
  const parseIfString = (field) => {
      if (typeof field === 'string') {
          try { return JSON.parse(field); } catch (e) { return field; }
      }
      return field;
  };

  data.professional = parseIfString(data.professional);
  data.location = parseIfString(data.location);
  data.payment = parseIfString(data.payment);
  data.services_offered = parseIfString(data.services_offered);
  data.portfolio = parseIfString(data.portfolio);
  data.languages = parseIfString(data.languages); // If languages sent as string array
  // -----------------------------------------------

  /* ===========================
       PROFILE IMAGE
  ============================ */
  if (req.files?.profile_image?.[0]) {
    freelancer.profile_image = req.files.profile_image[0].path;
  }

  /* ===========================
       BASIC INFO
  ============================ */
  // Handle req.body.name[first_name] vs parsed object
  if (data.name) {
      if(typeof data.name === 'string') data.name = JSON.parse(data.name); // Just in case
      if (data.name.first_name) freelancer.name.first_name = data.name.first_name.trim();
      if (data.name.last_name) freelancer.name.last_name = data.name.last_name.trim();
  }
  
  if (data.languages && Array.isArray(data.languages)) {
    freelancer.languages = data.languages;
  }

  /* ===========================
       PROFESSIONAL
  ============================ */
  if (!freelancer.professional) freelancer.professional = {};

  if (data.professional) {
    if (data.professional.experience_years !== undefined) freelancer.professional.experience_years = Number(data.professional.experience_years);
    if (data.professional.bio !== undefined) freelancer.professional.bio = data.professional.bio.trim();
    if (data.professional.working_radius !== undefined) freelancer.professional.working_radius = data.professional.working_radius.trim();
    if (data.professional.availability !== undefined) freelancer.professional.availability = data.professional.availability;
    
    // Skills handling (Array)
    if (data.professional.skills) {
       freelancer.professional.skills = Array.isArray(data.professional.skills) 
         ? data.professional.skills 
         : []; 
    }
  }

  /* ===========================
       LOCATION
  ============================ */
  if (!freelancer.location) freelancer.location = {};
  if (data.location) {
    if (data.location.city !== undefined) freelancer.location.city = data.location.city.trim();
    if (data.location.state !== undefined) freelancer.location.state = data.location.state.trim();
    if (data.location.country !== undefined) freelancer.location.country = data.location.country.trim();
    if (data.location.pincode !== undefined) freelancer.location.pincode = data.location.pincode.trim();
  }

  /* ===========================
       PAYMENT & CURRENCY
  ============================ */
  if (!freelancer.payment) freelancer.payment = {};
  if (data.payment) {
    if (data.payment.preferred_method !== undefined) freelancer.payment.preferred_method = data.payment.preferred_method.trim();
    if (data.payment.advance_percentage !== undefined) freelancer.payment.advance_percentage = Number(data.payment.advance_percentage);
    if (data.payment.gst_number !== undefined) freelancer.payment.gst_number = data.payment.gst_number.trim();
    // Save Currency ID
    if (data.payment.preferred_currency) {
      freelancer.payment.preferred_currency = data.payment.preferred_currency;
    }
  }

  /* ===========================
       SERVICES OFFERED
  ============================ */
  if (Array.isArray(data.services_offered)) {
    freelancer.services_offered = data.services_offered.map(s => ({
      category: s.category,
      subcategories: s.subcategories || [],
      description: s.description?.trim(),
      price_range: s.price_range?.trim(),
      unit: s.unit?.trim(),
      images: s.images || [],
      is_active: s.is_active ?? true
    }));
  }

  /* ===========================
       PORTFOLIO
  ============================ */
  if (Array.isArray(data.portfolio)) {
    freelancer.portfolio = data.portfolio.map(p => ({
      title: p.title?.trim(),
      category: p.category,
      subcategory: p.subcategory,
      description: p.description?.trim(),
      images: p.images || [],
      area: p.area,
      duration: p.duration,
      client_name: p.client_name,
      completed_at: p.completed_at,
      featured: p.featured ?? false
    }));
  }

  /* ===========================
       DOCUMENT UPLOADS
  ============================ */
  if (req.files) {
    const types = ['resume', 'identityProof', 'addressProof', 'certificate'];

    types.forEach(type => {
      // Check if file exists in req.files[type]
      if (req.files[type] && req.files[type].length > 0) {
        const file = req.files[type][0]; // Take first file
        
        // Find index of existing doc type
        const existingDocIndex = freelancer.documents.findIndex(d => d.type === type);

        const newDocData = {
           type,
           path: file.path,
           verified: false,
           verified_at: null,
           verified_by: null,
           reason: null,
           suggestion: null,
           uploaded_at: new Date()
        };

        if (existingDocIndex !== -1) {
          // Update existing
          // Preserve _id if needed, or let mongoose handle subdoc update
          const oldId = freelancer.documents[existingDocIndex]._id;
          freelancer.documents[existingDocIndex] = { ...newDocData, _id: oldId };
        } else {
          // Push new
          freelancer.documents.push(newDocData);
        }
      }
    });
  }

  /* ===========================
       ONBOARDING STATUS
  ============================ */
  const hasIdentity = freelancer.documents.some(d => d.type === 'identityProof');
  const hasAddress = freelancer.documents.some(d => d.type === 'addressProof');

  const hasCoreProfile =
    freelancer.professional?.bio &&
    freelancer.services_offered.length > 0 &&
    freelancer.location?.city;

  freelancer.onboarding_status =
    hasIdentity && hasAddress && hasCoreProfile
      ? 'profile_submitted'
      : 'profile_incomplete';

  /* ===========================
       META HISTORY
  ============================ */
  freelancer.meta.change_history.push({
    updated_by: freelancerId,
    changes: ['Profile updated via Web'],
    updated_at: new Date()
  });

  await freelancer.save();

  // Populate references for response
  await freelancer.populate([
    { path: 'services_offered.category', select: 'name slug icon' },
    { path: 'services_offered.subcategories', select: 'name slug' },
    { path: 'portfolio.category', select: 'name slug' },
    { path: 'portfolio.subcategory', select: 'name slug' },
    { path: 'payment.preferred_currency', select: 'code name symbol' },
    { path: 'role', select: 'name' }
  ]);

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Profile updated successfully',
    onboarding_status: freelancer.onboarding_status,
    freelancer
  });
});



exports.addRateCard = asyncHandler(async (req, res) => {
  const freelancerId = req.user?.id || req.user?._id;

  if (!freelancerId) {
    throw new APIError('Unauthorized', StatusCodes.UNAUTHORIZED);
  }

  const { serviceId, price_range, unit } = req.body;

  if (!serviceId || !price_range) {
    throw new APIError(
      'serviceId and price_range are required',
      StatusCodes.BAD_REQUEST
    );
  }

  const freelancer = await Freelancer.findById(freelancerId);
  if (!freelancer) {
    throw new APIError('Freelancer not found', StatusCodes.NOT_FOUND);
  }

  // 🔍 Find service subdocument
  const service = freelancer.services_offered.id(serviceId);
  if (!service) {
    throw new APIError('Service not found', StatusCodes.NOT_FOUND);
  }

  // ✅ Update rate card
  service.price_range = price_range.trim();
  if (unit !== undefined) {
    service.unit = unit.trim();
  }

  // 📝 Meta history
  freelancer.meta.change_history.push({
    updated_by: freelancerId,
    changes: [`Rate card updated for service ${service.category}`], // Log category ID or name if possible
    updated_at: new Date()
  });

  await freelancer.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Rate card updated successfully',
    service
  });
});

exports.updateFreelancerStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, rejection_reason } = req.body;

  const freelancer = await Freelancer.findById(id);
  if (!freelancer) {
    throw new APIError('Freelancer not found', StatusCodes.NOT_FOUND);
  }

  if (![0, 1, 2].includes(Number(status))) {
    throw new APIError('Invalid status', StatusCodes.BAD_REQUEST);
  }

  freelancer.status_info.status = Number(status);

  if (status == 1) {
    // APPROVED
    freelancer.status_info.approved_at = new Date();
    freelancer.status_info.approved_by = req.user._id;
    freelancer.onboarding_status = 'approved';
    freelancer.meta.portal_access = true;
  }

  if (status == 2) {
    // REJECTED
    freelancer.status_info.rejected_at = new Date();
    freelancer.status_info.rejected_by = req.user._id;
    freelancer.status_info.rejection_reason = rejection_reason;
    freelancer.onboarding_status = 'rejected';
    freelancer.meta.portal_access = false;
  }

  freelancer.meta.change_history.push({
    updated_by: req.user._id,
    changes: [`Freelancer status changed → ${status == 1 ? 'Approved' : 'Rejected'}`],
    updated_at: new Date(),
  });

  await freelancer.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Freelancer status updated successfully',
    onboarding_status: freelancer.onboarding_status,
    status_info: freelancer.status_info,
  });
});


exports.verifyFreelancerDocument = asyncHandler(async (req, res) => {
  const { freelancerId, documentId, verified, reason, suggestion } = req.body;

  const freelancer = await Freelancer.findById(freelancerId);
  if (!freelancer) {
    throw new APIError('Freelancer not found', StatusCodes.NOT_FOUND);
  }

  const doc = freelancer.documents.id(documentId);
  if (!doc) {
    throw new APIError('Document not found', StatusCodes.NOT_FOUND);
  }

  doc.verified = Boolean(verified);
  doc.verified_at = verified ? new Date() : null;
  doc.verified_by = verified ? req.user._id : null;
  doc.reason = verified ? null : reason;
  doc.suggestion = verified ? null : suggestion;

  // 🔄 Auto onboarding logic
  const requiredDocs = ['identityProof', 'addressProof'];
  const allVerified = requiredDocs.every(type =>
    freelancer.documents.some(d => d.type === type && d.verified)
  );

  if (allVerified && freelancer.onboarding_status === 'profile_submitted') {
    freelancer.onboarding_status = 'under_review';
  }

  if (!verified) {
    freelancer.onboarding_status = 'profile_incomplete';
  }

  freelancer.meta.change_history.push({
    updated_by: req.user._id,
    changes: [`Document ${doc.type} ${verified ? 'approved' : 'rejected'}`],
    updated_at: new Date(),
  });

  await freelancer.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: verified ? 'Document approved' : 'Document rejected',
    onboarding_status: freelancer.onboarding_status,
  });
});

// === UPLOAD / RE-UPLOAD DOCUMENT ===
// === UPLOAD / RE-UPLOAD DOCUMENT (AFTER REJECTION) ===
exports.updateDocument = asyncHandler(async (req, res) => {
  const { documentId } = req.params;

  if (!req.file) {
    throw new APIError('File is required', StatusCodes.BAD_REQUEST);
  }

  const freelancer = await Freelancer.findById(req.user.id);
  if (!freelancer) {
    throw new APIError('Freelancer not found', StatusCodes.NOT_FOUND);
  }

  const doc = freelancer.documents.id(documentId);
  if (!doc) {
    throw new APIError('Document not found', StatusCodes.NOT_FOUND);
  }

  // ❌ Verified documents cannot be changed
  if (doc.verified === true) {
    throw new APIError(
      'Verified document cannot be changed',
      StatusCodes.FORBIDDEN
    );
  }

  /* ===========================
     RESET REJECTED DOCUMENT
  ============================ */
  doc.path = req.file.path;
  doc.uploaded_at = new Date();

  // 🔄 Reset verification state
  doc.verified = false;
  doc.verified_at = null;
  doc.verified_by = null;
  doc.reason = null;
  doc.suggestion = null;

  /* ===========================
     ONBOARDING STATUS FIX
  ============================ */
  // If freelancer was rejected or profile incomplete due to doc
  if (
    freelancer.onboarding_status === 'rejected' ||
    freelancer.onboarding_status === 'profile_incomplete'
  ) {
    freelancer.onboarding_status = 'profile_submitted';
  }

  /* ===========================
     META HISTORY
  ============================ */
  freelancer.meta.change_history = freelancer.meta.change_history || [];
  freelancer.meta.change_history.push({
    updated_by: req.user._id,
    changes: [`Document ${doc.type} re-uploaded after rejection`],
    updated_at: new Date(),
  });

  await freelancer.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Document re-uploaded successfully. Awaiting verification.',
    onboarding_status: freelancer.onboarding_status,
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