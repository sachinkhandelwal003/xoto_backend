// controllers/freelancer/freelancer.controller.js
const winston = require('winston');
const Freelancer = require('../../models/Freelancer/freelancer.model');
const mongoose = require('mongoose');
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
exports.createFreelancer = asyncHandler(async (req, res) => {
  const data = req.body;

  /* ================= DUPLICATE CHECK ================= */
  const existing = await Freelancer.findOne({
    $or: [
      { email: data.email },
      {
        'mobile.country_code': data.mobile.country_code,
        'mobile.number': data.mobile.number
      }
    ]
  });

  if (existing)
    throw new APIError('Email or mobile already exists', StatusCodes.CONFLICT);

  if (!data.is_mobile_verified)
    throw new APIError('Mobile must be verified', StatusCodes.BAD_REQUEST);

  /* ================= ROLE ================= */
  const role = await Role.findOne({ name: 'Freelancer' });
  if (!role)
    throw new APIError('Role not found', StatusCodes.NOT_FOUND);

  /* ================= PREPARE DATA ================= */
  data.role = role._id;
  data.password = await bcrypt.hash(data.password, 10);

  data.status_info = { status: 0 }; // Pending
  data.documents = [];
  // data.services_offered = [];
  if (data.services_offered?.length) {
    data.services_offered = data.services_offered.map(service => ({
      category: service.category,
      subcategories: (service.subcategories || []).map(subId => ({
        type: subId,
        price_range: null,
        unit: service.unit || null,
        is_active: true
      })),
      description: service.description || '',
      images: [],
      is_active: true
    }));
  }
  data.performance = {};
  data.onboarding_status = 'registered';

  /* ================= CREATE ================= */
  const freelancer = await Freelancer.create(data);

  await freelancer.populate([
    { path: 'role' },
    { path: 'payment.preferred_currency' }
  ]);




  /* ================= RESPONSE ================= */
  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Registration successful. Awaiting admin approval.',
    freelancer: {
      _id: freelancer._id,
      email: freelancer.email,
      full_name: freelancer.full_name,
      onboarding_status: freelancer.onboarding_status
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
    freelancerId,

    // 🔥 NEW SERVICE FILTERS
    serviceCategory,
    serviceType,
    subcategory
  } = req.query;

  /* =====================================================
     1️⃣ SINGLE FREELANCER BY ID
  ===================================================== */
  if (freelancerId) {
    if (!mongoose.Types.ObjectId.isValid(freelancerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid freelancer ID"
      });
    }

    const freelancer = await Freelancer.findById(freelancerId)
      .select("-password")
      .populate("role", "name")
      .populate("services_offered.category", "label")
      .populate("services_offered.subcategories.type", "label")
      .populate("payment.preferred_currency", "name code symbol")
      .populate("status_info.approved_by status_info.rejected_by", "name email")
      .lean();

    if (!freelancer) {
      return res.status(404).json({
        success: false,
        message: "Freelancer not found"
      });
    }

    return res.status(200).json({
      success: true,
      freelancer
    });
  }

  /* =====================================================
     2️⃣ BASE FILTERS
  ===================================================== */
  const query = {};

  // Status: 0=Pending, 1=Approved, 2=Rejected
  if (status !== undefined) {
    query["status_info.status"] = Number(status);
  }

  // Active / Inactive
  if (isActive !== undefined) {
    query.isActive = isActive === "true";
  }

  // Search
  if (search) {
    query.$or = [
      { "name.first_name": { $regex: search, $options: "i" } },
      { "name.last_name": { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { "mobile.number": { $regex: search, $options: "i" } }
    ];
  }

  // City
  if (city) {
    query["location.city"] = { $regex: city, $options: "i" };
  }

  /* =====================================================
     3️⃣ 🔥 SERVICE-WISE FILTERING
  ===================================================== */

  // Category (Landscape / Interior)
  if (serviceCategory && mongoose.Types.ObjectId.isValid(serviceCategory)) {
    query["services_offered.category"] = serviceCategory;
  }

  // Type (EstimateMasterType)
  if (serviceType && mongoose.Types.ObjectId.isValid(serviceType)) {
    query["services_offered.subcategories.type"] = serviceType;
  }

  // Subcategory
  if (subcategory && mongoose.Types.ObjectId.isValid(subcategory)) {
    query["services_offered.subcategories.subcategory"] = subcategory;
  }

  /* =====================================================
     4️⃣ QUERY + POPULATE
  ===================================================== */
  let freelancersQuery = Freelancer.find(query)
    .select("-password")
    .populate("role", "name")
    .populate("services_offered.category", "label")
    .populate("services_offered.subcategories.type", "label")
    .populate("payment.preferred_currency", "code symbol")
    .sort({ createdAt: -1 });

  let pagination = null;

  /* =====================================================
     5️⃣ PAGINATION
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
      totalPages: Math.ceil(total / limitNum)
    };
  }

  /* =====================================================
     6️⃣ EXECUTE
  ===================================================== */
  const freelancers = await freelancersQuery.lean();

  res.status(200).json({
    success: true,
    freelancers,
    pagination
  });
});




// === GET FREELANCER PROFILE (LOGGED-IN USER) ===
exports.getFreelancerProfile = asyncHandler(async (req, res) => {
  const freelancer = await Freelancer.findById(req.user.id)
    .select('-password')
    .populate('role', 'name')
    .populate('services_offered.category', 'name  ')
    .populate('services_offered.subcategories.type', 'label')
    .populate('payment.preferred_currency', 'name code symbol')
    .lean();

  if (!freelancer) {
    throw new APIError('Freelancer not found', StatusCodes.NOT_FOUND);
  }

  /* ================================
     SECTION SCORING
  ================================= */

  const sections = {
    basic: 0,
    professional: 0,
    location: 0,
    services: 0,
    payment: 0,
    documents: 0,
    meta: 0,
  };

  /* -------- BASIC -------- */
  const basicFields = 5;
  let basicScore = 0;

  if (freelancer.name?.first_name) basicScore++;
  if (freelancer.name?.last_name) basicScore++;
  if (freelancer.email) basicScore++;
  if (freelancer.mobile?.number && freelancer.is_mobile_verified) basicScore++;
  if (freelancer.profile_image) basicScore++;

  sections.basic = Math.round((basicScore / basicFields) * 100);

  /* -------- PROFESSIONAL -------- */
  const profFields = 4;
  let profScore = 0;

  if (freelancer.professional?.experience_years >= 0) profScore++;
  if (freelancer.professional?.bio) profScore++;
  if ((freelancer.professional?.skills?.length ?? 0) > 0) profScore++;
  if (freelancer.professional?.availability) profScore++;

  sections.professional = Math.round((profScore / profFields) * 100);

  /* -------- LOCATION -------- */
  const locFields = 3;
  let locScore = 0;

  if (freelancer.location?.city) locScore++;
  if (freelancer.location?.state) locScore++;
  if (freelancer.location?.country) locScore++;

  sections.location = Math.round((locScore / locFields) * 100);

  /* -------- SERVICES (UPDATED LOGIC) -------- */
  if ((freelancer.services_offered?.length ?? 0) > 0) {
    const validServices = freelancer.services_offered.filter(service => {
      if (!service.category || !service.description) return false;
      if ((service.subcategories?.length ?? 0) === 0) return false;

      // 🔑 Each type must have pricing
      return service.subcategories.every(
        t => t.type && t.price_range && t.unit
      );
    });

    sections.services = Math.round(
      (validServices.length / freelancer.services_offered.length) * 100
    );
  }

  /* -------- PAYMENT -------- */
  const payFields = 2;
  let payScore = 0;

  if (freelancer.payment?.preferred_method) payScore++;
  if (freelancer.payment?.preferred_currency) payScore++;

  sections.payment = Math.round((payScore / payFields) * 100);

  /* -------- DOCUMENTS -------- */
  if ((freelancer.documents?.length ?? 0) > 0) {
    const verifiedDocs = freelancer.documents.filter(d => d.verified);
    sections.documents = Math.round(
      (verifiedDocs.length / freelancer.documents.length) * 100
    );
  }

  /* -------- META -------- */
  const metaFields = 2;
  let metaScore = 0;

  if (freelancer.meta?.agreed_to_terms) metaScore++;
  if (freelancer.meta?.portal_access) metaScore++;

  sections.meta = Math.round((metaScore / metaFields) * 100);

  /* ================================
     TOTAL COMPLETION
  ================================= */

  const completionPercentage = Math.round(
    Object.values(sections).reduce((a, b) => a + b, 0) /
    Object.keys(sections).length
  );

  /* ================================
     RESPONSE
  ================================= */

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

  const freelancer = await Freelancer.findById(freelancerId);
  if (!freelancer) {
    throw new APIError('Freelancer not found', StatusCodes.NOT_FOUND);
  }

  let data = req.body;

  /* ===========================
     HELPERS
  ============================ */
  const parseIfString = (val) => {
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return val; }
    }
    return val;
  };

  data.name = parseIfString(data.name);
  data.professional = parseIfString(data.professional);
  data.location = parseIfString(data.location);
  data.payment = parseIfString(data.payment);
  data.languages = parseIfString(data.languages);
  data.services_offered = parseIfString(data.services_offered);

  /* ===========================
     PROFILE IMAGE
  ============================ */
  if (req.files?.profile_image?.[0]) {
    freelancer.profile_image = req.files.profile_image[0].path;
  }

  /* ===========================
     BASIC INFO
  ============================ */
  if (data.name) {
    if (data.name.first_name) freelancer.name.first_name = data.name.first_name.trim();
    if (data.name.last_name) freelancer.name.last_name = data.name.last_name.trim();
  }

  if (Array.isArray(data.languages)) {
    freelancer.languages = data.languages;
  }

  /* ===========================
     PROFESSIONAL
  ============================ */
  if (data.professional) {
    freelancer.professional.experience_years =
      data.professional.experience_years ?? freelancer.professional.experience_years;

    if (data.professional.bio !== undefined)
      freelancer.professional.bio = data.professional.bio.trim();

    if (Array.isArray(data.professional.skills))
      freelancer.professional.skills = data.professional.skills;

    if (data.professional.availability)
      freelancer.professional.availability = data.professional.availability;
  }

  /* ===========================
     LOCATION
  ============================ */
  if (data.location) {
    Object.assign(freelancer.location, {
      city: data.location.city?.trim(),
      state: data.location.state?.trim(),
      country: data.location.country?.trim(),
      po_box: data.location.po_box?.trim()
    });
  }

  /* ===========================
     PAYMENT
  ============================ */
  if (data.payment) {
    if (data.payment.preferred_method)
      freelancer.payment.preferred_method = data.payment.preferred_method.trim();

    if (data.payment.vat_number !== undefined)
      freelancer.payment.vat_number = data.payment.vat_number.trim();

    if (data.payment.preferred_currency)
      freelancer.payment.preferred_currency = data.payment.preferred_currency;
  }

  /* ===========================
     SERVICES OFFERED (CRITICAL FIX)
  ============================ */
  if (Array.isArray(data.services_offered)) {
    freelancer.services_offered = data.services_offered.map(service => ({
      category: service.category,
      description: service.description?.trim(),
      is_active: service.is_active ?? true,

      subcategories: (service.subcategories || []).map(t => ({
        type: t.type,
        price_range: t.price_range?.trim() || null,
        unit: t.unit?.trim() || null,
        is_active: t.is_active ?? true
      }))
    }));
  }

  /* ===========================
     DOCUMENT UPLOADS
  ============================ */
  // if (req.files) {
  //   const docTypes = ['resume', 'identityProof', 'addressProof', 'certificate'];

  //   docTypes.forEach(type => {
  //     if (req.files[type]?.[0]) {
  //       const file = req.files[type][0];
  //       const index = freelancer.documents.findIndex(d => d.type === type);

  //       const doc = {
  //         type,
  //         path: file.path,
  //         verified: false,
  //         uploaded_at: new Date()
  //       };

  //       if (index >= 0) freelancer.documents[index] = { ...freelancer.documents[index], ...doc };
  //       else freelancer.documents.push(doc);
  //     }
  //   });
  // }

  /* ===========================
   DOCUMENT LINKS (S3)
=========================== */
  if (Array.isArray(data.documents)) {
    data.documents.forEach(doc => {
      if (!doc.type || !doc.path) return;

      const index = freelancer.documents.findIndex(d => d.type === doc.type);

      const documentData = {
        type: doc.type,
        path: doc.path,
        verified: false,          // reset on re-upload
        verified_at: null,
        verified_by: null,
        uploaded_at: new Date()
      };

      if (index >= 0) {
        freelancer.documents[index] = {
          ...freelancer.documents[index],
          ...documentData
        };
      } else {
        freelancer.documents.push(documentData);
      }
    });
  }


  /* ===========================
     ONBOARDING STATUS (UPDATED)
  ============================ */
  const hasRequiredDocs =
    freelancer.documents.some(d => d.type === 'identityProof') &&
    freelancer.documents.some(d => d.type === 'addressProof');

  const hasValidServices =
    freelancer.services_offered.length > 0 &&
    freelancer.services_offered.every(s =>
      s.category &&
      s.description &&
      s.subcategories.length > 0 &&
      s.subcategories.every(t => t.price_range && t.unit)
    );

  freelancer.onboarding_status =
    hasRequiredDocs && hasValidServices && freelancer.location?.city
      ? 'profile_submitted'
      : 'profile_incomplete';

  /* ===========================
     META HISTORY
  ============================ */


  await freelancer.save();

  await freelancer.populate([
    { path: 'role', select: 'name' },
    { path: 'services_offered.category', select: 'name slug icon' },
    { path: 'services_offered.subcategories.type', select: 'name slug' },
    { path: 'payment.preferred_currency', select: 'code name symbol' }
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

  const { serviceId, typeId, price_range, unit } = req.body;

  if (!serviceId || !typeId || !price_range) {
    throw new APIError(
      'serviceId, typeId and price_range are required',
      StatusCodes.BAD_REQUEST
    );
  }

  const freelancer = await Freelancer.findById(freelancerId);
  if (!freelancer) {
    throw new APIError('Freelancer not found', StatusCodes.NOT_FOUND);
  }

  // 🔍 Find service
  const service = freelancer.services_offered.id(serviceId);
  if (!service) {
    throw new APIError('Service not found', StatusCodes.NOT_FOUND);
  }

  // 🔍 Find type inside service
  const typeItem = service.subcategories.find(
    s => s.type.toString() === typeId
  );

  if (!typeItem) {
    throw new APIError('Service type not found', StatusCodes.NOT_FOUND);
  }

  // ✅ Update rate card
  typeItem.price_range = price_range.trim();
  if (unit) typeItem.unit = unit.trim();



  await freelancer.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Rate card updated successfully',
    rate_card: typeItem
  });
});

exports.updateFreelancerStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, rejection_reason } = req.body;

  const freelancer = await Freelancer.findById(id);
  if (!freelancer) {
    throw new APIError('Freelancer not found', StatusCodes.NOT_FOUND);
  }


  if (freelancer.onboarding_status == "registered" || freelancer.onboarding_status == "profile_incomplete") {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: true,
      message: "We cannot approve the profile of freelancer till its profile is completed.",
      data: null
    });
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