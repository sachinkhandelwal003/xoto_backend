const winston = require('winston');
const VendorB2C = require('../../models/Vendor/B2cvendor.model');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const asyncHandler = require('../../../../utils/asyncHandler');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { createToken } = require('../../../../middleware/auth');
const { Role } = require('../../models/role/role.model');
const Category = require('../../../ecommerce/B2C/models/category.model'); // Adjust path to your Category model
// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/vendor.log' }),
    new winston.transports.Console()
  ]
});

// Vendor Login
exports.vendorLogin = asyncHandler(async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find vendor and populate role
    const vendor = await VendorB2C.findOne({ email })
      .select('+password')
      .populate({
        path: 'role',
        model: Role,
      });

    if (!vendor) {
      throw new APIError('Invalid credentials', StatusCodes.UNAUTHORIZED);
    }

    // Compare hashed password
    const isMatch = await bcrypt.compare(password, vendor.password);
    if (!isMatch) {
      throw new APIError('Invalid credentials', StatusCodes.UNAUTHORIZED);
    }

    // Generate token
    const token = createToken(vendor);

    // Convert to object & remove password
    const vendorResponse = vendor.toObject();
    delete vendorResponse.password;

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Login successful',
      token,
      vendor: vendorResponse,
    });
  } catch (error) {
    if (!error.message) error.message = 'Unidentified error';
    next(error);
  }
});
exports.updateVendorProfile = asyncHandler(async (req, res) => {
  const vendorId = req.user._id;

  let vendor = await VendorB2C.findById(vendorId);
  if (!vendor) {
    throw new APIError("Vendor not found", StatusCodes.NOT_FOUND);
  }

  const data = req.body;

  /** -----------------------------
   *  UPDATE BASIC INFORMATION
   * ----------------------------- */
  if (data.first_name) vendor.name.first_name = data.first_name.trim();
  if (data.last_name) vendor.name.last_name = data.last_name.trim();

  /** -----------------------------
   *  UPDATE STORE DETAILS
   * ----------------------------- */
  if (data.store_name) vendor.store_details.store_name = data.store_name;
  if (data.store_description) vendor.store_details.store_description = data.store_description;
  if (data.store_type) vendor.store_details.store_type = data.store_type;
  if (data.store_address) vendor.store_details.store_address = data.store_address;
  if (data.city) vendor.store_details.city = data.city;
  if (data.state) vendor.store_details.state = data.state;
  if (data.country) vendor.store_details.country = data.country;
  if (data.pincode) vendor.store_details.pincode = data.pincode;
  if (data.website) vendor.store_details.website = data.website;

  if (data.categories) {
    vendor.store_details.categories = data.categories.split(",").map(
      id => new mongoose.Types.ObjectId(id)
    );
  }

  vendor.store_details.social_links = {
    ...vendor.store_details.social_links,
    ...data.social_links
  };

  /** -----------------------------
   *  UPDATE REGISTRATION
   * ----------------------------- */
  if (data.pan_number) vendor.registration.pan_number = data.pan_number.toUpperCase();
  if (data.gstin) vendor.registration.gstin = data.gstin.toUpperCase();

  /** -----------------------------
   *  UPDATE CONTACTS
   * ----------------------------- */
  if (data.primary_contact_name) {
    vendor.contacts.primary_contact = {
      name: data.primary_contact_name,
      designation: data.primary_contact_designation,
      email: data.primary_contact_email,
      mobile: data.primary_contact_mobile,
      whatsapp: data.primary_contact_whatsapp
    };
  }

  if (data.support_contact_name) {
    vendor.contacts.support_contact = {
      name: data.support_contact_name,
      designation: data.support_contact_designation,
      email: data.support_contact_email,
      mobile: data.support_contact_mobile,
      whatsapp: data.support_contact_whatsapp
    };
  }

  /** -----------------------------
   *  UPDATE BANK DETAILS
   * ----------------------------- */
  vendor.bank_details = {
    ...vendor.bank_details,
    ...data
  };

  /** -----------------------------
   *  UPDATE OPERATIONS
   * ----------------------------- */
  if (data.delivery_modes) {
    vendor.operations.delivery_modes = data.delivery_modes.split(",");
  }

  if (data.return_policy) vendor.operations.return_policy = data.return_policy;
  if (data.avg_delivery_time_days) vendor.operations.avg_delivery_time_days = Number(data.avg_delivery_time_days);

  /** -----------------------------
   *  UPDATE DOCUMENTS
   * ----------------------------- */
  if (req.files?.logo?.[0]) vendor.store_details.logo = req.files.logo[0].path;

  if (req.files?.identity_proof?.[0]) {
    vendor.documents.identity_proof = {
      path: req.files.identity_proof[0].path,
      verified: false
    };
  }

  if (req.files?.address_proof?.[0]) {
    vendor.documents.address_proof = {
      path: req.files.address_proof[0].path,
      verified: false
    };
  }

  if (req.files?.gst_certificate?.[0]) {
    vendor.documents.gst_certificate = {
      path: req.files.gst_certificate[0].path,
      verified: false
    };
  }

  if (req.files?.cancelled_cheque?.[0]) {
    vendor.documents.cancelled_cheque = {
      path: req.files.cancelled_cheque[0].path,
      verified: false
    };
  }

  if (req.files?.shop_act_license?.[0]) {
    vendor.documents.shop_act_license = {
      path: req.files.shop_act_license[0].path,
      verified: false
    };
  }

  /** -----------------------------
   *  CHECK IF PROFILE IS COMPLETE
   * ----------------------------- */

  const isComplete =
    vendor.store_details.store_name &&
    vendor.store_details.store_address &&
    vendor.store_details.categories?.length > 0 &&
    vendor.documents.identity_proof?.path &&
    vendor.documents.address_proof?.path &&
    vendor.registration.pan_number &&
    vendor.contacts.primary_contact &&
    vendor.bank_details.bank_account_number;

  if (isComplete) {
    vendor.onboarding_status = "profile_submitted"; // Fully done
  } else {
    vendor.onboarding_status = "profile_incomplete"; // Still missing fields
  }

  /** -----------------------------
   *  META
   * ----------------------------- */
  vendor.meta.updated_at = new Date();

  await vendor.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Profile updated successfully",
    onboarding_status: vendor.onboarding_status,
    data: vendor
  });
});




exports.createVendor = asyncHandler(async (req, res) => {
  const {
    first_name,
    last_name,
    email,
    mobile, // { country_code, number }
    password,
    confirmPassword,
    store_details,
    registration,
    meta
  } = req.body;

  // 1. Password match
  if (password !== confirmPassword) {
    throw new APIError('Passwords do not match', StatusCodes.BAD_REQUEST);
  }

  // 2. Check if email or mobile already exists
  const existing = await VendorB2C.findOne({
    $or: [
      { email: email.toLowerCase() },
      { 'mobile.number': mobile.number }
    ]
  });
  if (existing) {
    throw new APIError('Email or Mobile already registered', StatusCodes.CONFLICT);
  }

  // 3. Find Vendor Role
  const vendorRole = await Role.findOne({ name: 'Vendor-B2C' });
  if (!vendorRole) {
    throw new APIError('Vendor role not found', StatusCodes.INTERNAL_SERVER_ERROR);
  }

  // 4. Build vendor data
  const vendorData = {
    name: {
      first_name: first_name.trim(),
      last_name: last_name.trim()
    },
    email: email.toLowerCase(),
    password: await bcrypt.hash(password, 12),
    mobile: {
      country_code: mobile.country_code || '+91',
      number: mobile.number
    },
    role: vendorRole._id,
    status_info: { status: 0 }, // pending
    store_details: {
      store_name: store_details.store_name,
      store_description: store_details.store_description || '',
      store_type: store_details.store_type,
      store_address: store_details.store_address,
      city: store_details.city,
      country: store_details.country || 'India',
      pincode: store_details.pincode,
      categories: store_details.categories.map(id => new mongoose.Types.ObjectId(id)),
      website: store_details.website || '',
      social_links: store_details.social_links || {}
    },
    registration: {
      pan_number: registration?.pan_number?.toUpperCase(),
      gstin: registration?.gstin?.toUpperCase() || ''
    },
    onboarding_status: 'profile_submitted',
    status_info: { status: 0 }, // pending
    meta: {
      agreed_to_terms: meta?.agreed_to_terms === true || meta?.agreed_to_terms === 'true',
      change_history: [{
        updated_by: req.user?._id || null,
        changes: ['Vendor account created']
      }]
    }
  };

  // 5. Handle Logo


  // 7. Create Vendor
  const vendor = await VendorB2C.create(vendorData);

  // 8. Populate categories for response
  const populatedVendor = await VendorB2C.findById(vendor._id)
    .populate('store_details.categories', 'name slug')
    .select(`
      name email mobile store_details.store_name store_details.logo
      store_details.city store_details.pincode status_info.status
    `);

  logger.info(`New Vendor Registered: ${vendor._id} - ${email}`);

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Vendor registered successfully! Awaiting admin approval.',
    data: populatedVendor
  });
});

// Get All Vendors
// Get All Vendors
// controllers/vendor/b2cvendor.controller.js

exports.getAllVendors = asyncHandler(async (req, res) => {
  const { page, limit, status, onboarding_status, vendorId } = req.query;

  /**
   * ---------------------------------------------------------
   * 1. GET SINGLE VENDOR (FULL DETAIL)
   * -----------------------------------------------------
   */
  if (vendorId) {
    const vendor = await VendorB2C.findById(vendorId)
      .select("-password -meta.change_history")
      .populate("store_details.categories", "name slug icon")
      .populate("bank_details.preferred_currency", "code name symbol")
      .populate("role", "name")
      .populate("documents.identity_proof")
      .populate("documents.address_proof")
      .populate("documents.pan_card")
      .populate("documents.gst_certificate")
      .populate("documents.cancelled_cheque")
      .populate("documents.shop_act_license")
      .lean();

    if (!vendor) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Vendor not found",
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      vendor,
    });
  }

  /**
   * ---------------------------------------------------------
   * 2. BUILD FILTER QUERY
   * ---------------------------------------------------------
   */
  const query = {};

  if (status !== undefined) {
    const statusArray = status
      .split(",")
      .map((s) => parseInt(s.trim()))
      .filter((n) => [0, 1, 2].includes(n));

    if (statusArray.length > 0) {
      query["status_info.status"] = { $in: statusArray };
    }
  }

  if (onboarding_status) {
    const validStatuses = [
      "registered",
      "profile_incomplete",
      "profile_submitted",
      "under_review",
      "approved",
      "rejected",
      "suspended",
    ];

    const statuses = onboarding_status
      .split(",")
      .map((s) => s.trim())
      .filter((s) => validStatuses.includes(s));

    if (statuses.length > 0) {
      query.onboarding_status = { $in: statuses };
    }
  }

  /**
   * ---------------------------------------------------------
   * 3. PAGINATION CHECK
   * ---------------------------------------------------------
   */
  const noPagination = !page && !limit;

  let vendors;
  let total;

  /**
   * ---------------------------------------------------------
   * 4. COMMON QUERY (USED BY BOTH PAGINATED & NON-PAGINATED)
   * ---------------------------------------------------------
   */
  const populateQuery = VendorB2C.find(query)
    .select("-password -meta.change_history")
    .populate("store_details.categories", "name slug icon")
    .populate("bank_details.preferred_currency", "code name symbol")
    .populate("role", "name")
    .populate("documents.identity_proof")
    .populate("documents.address_proof")
    .populate("documents.pan_card")
    .populate("documents.gst_certificate")
    .populate("documents.cancelled_cheque")
    .populate("documents.shop_act_license")
    .sort({ createdAt: -1 })
    .lean();

  /**
   * ---------------------------------------------------------
   * 5. FETCH ALL OR PAGINATED
   * ---------------------------------------------------------
   */
  if (noPagination) {
    vendors = await populateQuery;
    total = vendors.length;
  } else {
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    vendors = await populateQuery
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    total = await VendorB2C.countDocuments(query);
  }

  /**
   * ---------------------------------------------------------
   * 6. RESPONSE
   * ---------------------------------------------------------
   */
  res.status(StatusCodes.OK).json({
    success: true,
    count: vendors.length,
    pagination: noPagination
      ? null
      : {
          current_page: parseInt(page),
          limit: parseInt(limit),
          total_vendors: total,
          total_pages: Math.ceil(total / limit),
          has_next: parseInt(page) < Math.ceil(total / limit),
          has_prev: parseInt(page) > 1,
        },
    vendors,
  });
});



// Get Vendor Profile
// Get Vendor Profile
exports.getVendorProfile = asyncHandler(async (req, res) => {
  const vendor = await VendorB2C.findById(req.user.id)
    .select('-password')
      .populate("store_details.categories", "name slug icon")
    .populate('bank_details.preferred_currency', 'code name symbol')
    .populate('role', 'name')
    .lean();

  if (!vendor) {
    throw new APIError('Vendor not found', StatusCodes.NOT_FOUND);
  }

  res.status(StatusCodes.OK).json({
    
    success: true,
    message: "Profile fetched successfully",
    vendor
  });
});


// Change Password
exports.changePassword = asyncHandler(async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      throw new APIError('New passwords do not match', StatusCodes.BAD_REQUEST);
    }

    const vendor = await VendorB2C.findById(req.user.id).select('+password');

    if (!vendor) {
      throw new APIError('Vendor not found', StatusCodes.NOT_FOUND);
    }

    const isMatch = await bcrypt.compare(currentPassword, vendor.password);
    if (!isMatch) {
      throw new APIError('Current password is incorrect', StatusCodes.UNAUTHORIZED);
    }

    vendor.password = await bcrypt.hash(newPassword, 10);

    vendor.meta.updated_at = Date.now();
    vendor.meta.change_history = vendor.meta.change_history || [];
    vendor.meta.change_history.push({
      updated_by: req.user._id,
      updated_at: new Date(),
      changes: ['Password changed']
    });

    await vendor.save();

    logger.info(`Password changed for vendor: ${vendor._id}`);
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    if (!error.message) error.message = 'Unidentified error';
    next(error);
  }
});

// Update Document
exports.updateDocument = asyncHandler(async (req, res, next) => {
  try {
    const { documentId } = req.params;

    if (!req.file) {
      throw new APIError('File is required for update', StatusCodes.BAD_REQUEST);
    }

    const vendor = await VendorB2C.findById(req.user.id);

    if (!vendor) {
      throw new APIError('Vendor not found', StatusCodes.NOT_FOUND);
    }

    let document = null;
    let documentField = null;

    for (const [type, docField] of Object.entries(vendor.documents.toObject())) {
      if (docField && docField._id?.toString() === documentId) {
        document = vendor.documents[type];
        documentField = type;
        break;
      }
    }

    if (!document) {
      throw new APIError('Document not found', StatusCodes.NOT_FOUND);
    }

    if (document.verified) {
      throw new APIError('Cannot update verified document', StatusCodes.FORBIDDEN);
    }

    document.path = req.file.path;
    document.uploaded_at = new Date();

    vendor.meta.updated_at = new Date();
    vendor.meta.change_history = vendor.meta.change_history || [];
    vendor.meta.change_history.push({
      updated_by: req.user._id,
      updated_at: new Date(),
      changes: [`Document ${documentField} path updated`]
    });

    await vendor.save();

    logger.info(`Document ${documentId} path updated for vendor: ${vendor._id}`);
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Document path updated successfully',
      vendor: {
        id: vendor._id,
        documents: vendor.documents
      }
    });
  } catch (error) {
    if (!error.message) error.message = 'Unidentified error';
    if (error instanceof multer.MulterError) {
      return next(new APIError('File upload error: ' + error.message, StatusCodes.BAD_REQUEST));
    } else if (error.message.includes('Only images')) {
      return next(new APIError(error.message, StatusCodes.BAD_REQUEST));
    }
    next(error);
  }
});

// Update Vendor
exports.updateVendor = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    logger.warn('Unauthorized vendor update attempt');
    throw new APIError('Unauthorized: User not found', StatusCodes.UNAUTHORIZED);
  }

  const vendor = await VendorB2C.findById(req.params.id);
  if (!vendor) {
    logger.warn(`Vendor not found for update: ${req.params.id}`);
    throw new APIError('Vendor not found', StatusCodes.NOT_FOUND);
  }

  const updatedData = req.body;
  if (updatedData.email && updatedData.email !== vendor.email) {
    const existingVendor = await VendorB2C.findOne({ email: updatedData.email });
    if (existingVendor) {
      logger.warn(`Update failed: Email already in use - ${updatedData.email}`);
      throw new APIError('Email already in use', StatusCodes.CONFLICT);
    }
  }

  Object.assign(vendor, updatedData);
  vendor.meta.updated_at = Date.now();
  vendor.meta.change_history = vendor.meta.change_history || [];
  vendor.meta.change_history.push({
    updated_by: req.user._id,
    updated_at: new Date(),
    changes: Object.keys(updatedData).map(key => `${key} updated`)
  });

  const updatedVendor = await vendor.save();

  logger.info(`Vendor updated successfully: ${vendor._id}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Vendor updated successfully',
    vendor: {
      id: updatedVendor._id,
      email: updatedVendor.email,
      full_name: updatedVendor.full_name,
      store_details: updatedVendor.store_details
    }
  });
});

// Delete Vendor
exports.deleteVendor = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    logger.warn('Unauthorized vendor deletion attempt');
    throw new APIError('Unauthorized: User not found', StatusCodes.UNAUTHORIZED);
  }

  const vendor = await VendorB2C.findById(req.params.id);
  if (!vendor) {
    logger.warn(`Vendor not found for deletion: ${req.params.id}`);
    throw new APIError('Vendor not found', StatusCodes.NOT_FOUND);
  }

  vendor.meta.updated_at = new Date();
  vendor.meta.change_history = vendor.meta.change_history || [];
  vendor.meta.change_history.push({
    updated_by: req.user._id,
    updated_at: new Date(),
    changes: ['Vendor deleted']
  });

  await vendor.save();
  await vendor.deleteOne();

  logger.info(`Vendor deleted successfully: ${vendor._id}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Vendor deleted successfully'
  });
});

// Update Vendor Status
// Update Vendor Status (admin)
exports.updateVendorStatus = asyncHandler(async (req, res, next) => {
  const { status, rejection_reason, onboarding_status } = req.body;
  const allowedOnboarding = ['registered','profile_incomplete','profile_submitted','under_review','approved','rejected','suspended'];

  const vendor = await VendorB2C.findById(req.params.id);
  if (!vendor) {
    logger.warn(`Vendor not found for status update: ${req.params.id}`);
    throw new APIError('Vendor not found', StatusCodes.NOT_FOUND);
  }

  // Validate numeric status (0,1,2) if provided
  if (status !== undefined) {
    const s = parseInt(status);
    if (![0,1,2].includes(s)) {
      throw new APIError('Invalid status value. Allowed: 0,1,2', StatusCodes.BAD_REQUEST);
    }
    vendor.status_info.status = s;
  }

  // Set rejection reason if present
  if (rejection_reason) {
    vendor.status_info.rejection_reason = rejection_reason;
  }

  // Handle explicit onboarding_status (admin may want to set it)
  if (onboarding_status) {
    if (!allowedOnboarding.includes(onboarding_status)) {
      throw new APIError('Invalid onboarding_status value', StatusCodes.BAD_REQUEST);
    }
    vendor.onboarding_status = onboarding_status;
  } else {
    // If onboarding_status not supplied, derive from status when appropriate
    if (status !== undefined) {
      const s = parseInt(status);
      if (s === 1) { // approved
        vendor.status_info.approved_at = new Date();
        vendor.status_info.approved_by = req.user._id;
        vendor.onboarding_status = 'approved';
      } else if (s === 2) { // rejected
        vendor.status_info.rejected_at = new Date();
        vendor.status_info.rejected_by = req.user._id;
        vendor.onboarding_status = 'rejected';
      }
      // s===0 -> keep existing onboarding_status unless admin passed one
    }
  }

  // meta + change history
  vendor.meta.updated_at = new Date();
  vendor.meta.change_history = vendor.meta.change_history || [];
  vendor.meta.change_history.push({
    updated_by: req.user._id,
    updated_at: new Date(),
    changes: [`Status updated to ${vendor.status_info.status}`, `Onboarding_status => ${vendor.onboarding_status}`]
  });

  await vendor.save();

  logger.info(`Vendor status updated: ${vendor._id}, status: ${vendor.status_info.status}, onboarding_status: ${vendor.onboarding_status}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Vendor status updated',
    vendor: {
      id: vendor._id,
      onboarding_status: vendor.onboarding_status,
      status_info: vendor.status_info
    }
  });
});


// Update Document Verification
// Update Document Verification (admin)
exports.updateDocumentVerification = asyncHandler(async (req, res) => {
  const { vendorId, documentField, verified, reason, suggestion } = req.body;
  // documentField is name like: identity_proof, address_proof, gst_certificate, pan_card, cancelled_cheque, shop_act_license
  const REQUIRED_DOCS = ['identity_proof', 'address_proof']; // adjust as per your policy

  if (!vendorId || !documentField || typeof verified === 'undefined') {
    throw new APIError('vendorId, documentField and verified are required', StatusCodes.BAD_REQUEST);
  }

  const vendor = await VendorB2C.findById(vendorId);
  if (!vendor) {
    throw new APIError('Vendor not found', StatusCodes.NOT_FOUND);
  }

  // Ensure document field exists on model
  if (!Object.prototype.hasOwnProperty.call(vendor.documents.toObject(), documentField)) {
    throw new APIError('Invalid document field', StatusCodes.BAD_REQUEST);
  }

  const doc = vendor.documents[documentField];
  if (!doc || !doc.path) {
    throw new APIError('Document not uploaded', StatusCodes.BAD_REQUEST);
  }

  // Update verification state
  doc.verified = !!verified;
  doc.verified_at = verified ? new Date() : null;
  doc.verified_by = verified ? req.user._id : null;
  doc.reason = verified ? null : (reason || doc.reason || 'Document not valid');
  doc.suggestion = verified ? null : (suggestion || doc.suggestion || 'Please re-upload with correct details');

  // Update meta & history
  vendor.meta.updated_at = new Date();
  vendor.meta.change_history = vendor.meta.change_history || [];
  vendor.meta.change_history.push({
    updated_by: req.user._id,
    updated_at: new Date(),
    changes: [`Document ${documentField} verification set to ${doc.verified ? 'APPROVED' : 'REJECTED'}`]
  });

  // After updating this document, compute overall document verification status
  const allRequiredPresent = REQUIRED_DOCS.every(f => vendor.documents[f] && vendor.documents[f].path);
  const allRequiredVerified = allRequiredPresent && REQUIRED_DOCS.every(f => vendor.documents[f].verified === true);

  // Determine onboarding status transitions:
  // - If a required doc was rejected -> profile_incomplete
  // - If all required docs are now verified AND vendor had already submitted profile -> move to 'under_review'
  if (!doc.verified && REQUIRED_DOCS.includes(documentField)) {
    vendor.onboarding_status = 'profile_incomplete';
  } else if (allRequiredVerified) {
    // If vendor already completed profile fields and had submitted, move to under_review
    const hasProfileFields =
      vendor.store_details?.store_name &&
      vendor.store_details?.store_address &&
      vendor.store_details?.categories?.length > 0 &&
      vendor.registration?.pan_number &&
      vendor.contacts?.primary_contact &&
      vendor.bank_details?.bank_account_number;

    if (hasProfileFields) {
      // If vendor was profile_submitted -> proceed to under_review
      if (vendor.onboarding_status === 'profile_submitted' || vendor.onboarding_status === 'profile_incomplete') {
        vendor.onboarding_status = 'under_review';
      }
      // If admin wants to immediately approve after verifying docs, they can call updateVendorStatus separately with status=1
    }
  }

  await vendor.save();

  logger.info(`Document verification updated for vendor: ${vendor._id}, document: ${documentField}, verified: ${doc.verified}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: doc.verified ? 'Document approved' : 'Document rejected',
    vendor: {
      id: vendor._id,
      onboarding_status: vendor.onboarding_status,
      documents: vendor.documents
    }
  });
});


// Get Change History
exports.getChangeHistory = asyncHandler(async (req, res, next) => {
  try {
    const { vendorId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const vendor = await VendorB2C.findById(vendorId)
      .select('meta.change_history')
      .lean();

    if (!vendor) {
      logger.warn(`Vendor not found for change history: ${vendorId}`);
      throw new APIError('Vendor not found', StatusCodes.NOT_FOUND);
    }

    const changeHistory = vendor.meta.change_history || [];
    const total = changeHistory.length;

    // Paginate the change history
    const startIndex = (page - 1) * limit;
    const paginatedHistory = changeHistory.slice(startIndex, startIndex + Number(limit));

    logger.info(`Retrieved change history for vendor: ${vendorId}, page: ${page}, limit: ${limit}`);
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Change history retrieved successfully',
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total
      },
      change_history: paginatedHistory
    });
  } catch (error) {
    if (error.name === 'CastError') {
      logger.warn(`Invalid vendor ID format: ${vendorId}`);
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Invalid vendor ID format'
      });
    }
    if (!error.message) error.message = 'Unidentified error';
    next(error);
  }
});