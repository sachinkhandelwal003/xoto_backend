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
    meta: {
      agreed_to_terms: meta?.agreed_to_terms === true || meta?.agreed_to_terms === 'true',
      change_history: [{
        updated_by: req.user?._id || null,
        changes: ['Vendor account created']
      }]
    }
  };

  // 5. Handle Logo
  if (req.files?.logo?.[0]) {
    vendorData.store_details.logo = req.files.logo[0].path;
  }

// 6. Handle Documents (identity & address proof mandatory)
vendorData.documents = {
  identity_proof: {
    path: req.files?.identityProof?.[0]?.path,
    verified: false
  },
  address_proof: {
    path: req.files?.addressProof?.[0]?.path,
    verified: false
  },
  gst_certificate: req.files?.gstCertificate?.[0]
    ? { path: req.files.gstCertificate[0].path, verified: false }
    : undefined
};


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
exports.getAllVendors = asyncHandler(async (req, res, next) => {
  const { page, limit, status, vendorId } = req.query;

  // 1️⃣ Get single vendor
  if (vendorId) {
    try {
      const vendor = await VendorB2C.findById(vendorId)
        .select('-password')
        .populate('store_details.categories', 'name slug icon')  // 🟣 POPULATE
        .lean();

      if (!vendor) {
        return res.status(StatusCodes.NOT_FOUND).json({
          success: false,
          message: "Vendor not found"
        });
      }

      return res.status(StatusCodes.OK).json({
        success: true,
        vendor
      });

    } catch (error) {
      if (error.name === "CastError") {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "Invalid vendor ID format"
        });
      }
      return next(error);
    }
  }

  // 2️⃣ Build query
  const query = {};
  if (status !== undefined) {
    query["status_info.status"] = Number(status);
  }

  // 3️⃣ No pagination → return all vendors
  if (!page || !limit) {
    const vendors = await VendorB2C.find(query)
      .select('-password')
      .populate('store_details.categories', 'name slug icon') // 🟣 POPULATE
      .lean();

    return res.status(StatusCodes.OK).json({
      success: true,
      pagination: null,
      vendors
    });
  }

  // 4️⃣ Pagination mode
  const pageNum = Number(page);
  const limitNum = Number(limit);

  const vendors = await VendorB2C.find(query)
    .select('-password')
    .populate('store_details.categories', 'name slug icon')  // 🟣 POPULATE
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .lean();

  const total = await VendorB2C.countDocuments(query);

  res.status(StatusCodes.OK).json({
    success: true,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum)
    },
    vendors
  });
});



// Get Vendor Profile
exports.getVendorProfile = asyncHandler(async (req, res, next) => {
  try {
    const vendor = await VendorB2C.findById(req.user.id).populate('role').lean();
    if (!vendor) {
      throw new APIError('Vendor not found', StatusCodes.NOT_FOUND);
    }

    delete vendor.password;

    res.status(StatusCodes.OK).json({
      success: true,
      vendor,
    });
  } catch (error) {
    if (!error.message) error.message = 'Unidentified error';
    next(error);
  }
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
exports.updateVendorStatus = asyncHandler(async (req, res, next) => {
  const { status, rejection_reason } = req.body;

  const vendor = await VendorB2C.findById(req.params.id);
  if (!vendor) {
    logger.warn(`Vendor not found for status update: ${req.params.id}`);
    throw new APIError('Vendor not found', StatusCodes.NOT_FOUND);
  }

  vendor.status_info.status = parseInt(status);
  vendor.status_info.rejection_reason = rejection_reason || vendor.status_info.rejection_reason;
  if (status === 1) {
    vendor.status_info.approved_at = Date.now();
    vendor.status_info.approved_by = req.user._id;
  }

  vendor.meta.updated_at = new Date();
  vendor.meta.change_history = vendor.meta.change_history || [];
  vendor.meta.change_history.push({
    updated_by: req.user._id,
    updated_at: new Date(),
    changes: [`Status updated to ${status}`]
  });

  await vendor.save();

  logger.info(`Vendor status updated: ${vendor._id}, status: ${status}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Vendor status updated',
    vendor: {
      id: vendor._id,
      status_info: vendor.status_info
    }
  });
});

// Update Document Verification
exports.updateDocumentVerification = asyncHandler(async (req, res) => {
  const { vendorId, documentId, verified, reason, suggestion } = req.body;

  const vendor = await VendorB2C.findById(vendorId);
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
    throw new APIError(
      'Document not found or not uploaded properly. Please re-upload.',
      StatusCodes.BAD_REQUEST
    );
  }

  if (verified) {
    document.verified = true;
    document.reason = null;
    document.suggestion = null;
  } else {
    document.verified = false;
    document.reason = reason || 'Document not valid';
    document.suggestion = suggestion || 'Please re-upload with correct details';
  }

  vendor.meta.updated_at = new Date();
  vendor.meta.change_history = vendor.meta.change_history || [];
  vendor.meta.change_history.push({
    updated_by: req.user?._id,
    updated_at: new Date(),
    changes: [
      `Document ${documentField} verification set to ${verified ? 'APPROVED' : 'REJECTED'}`
    ]
  });

  await vendor.save();

  logger.info(`Document verification updated for vendor: ${vendor._id}, document: ${documentField}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: verified
      ? 'Document approved successfully'
      : 'Document rejected, please re-upload',
    vendor: {
      id: vendor._id,
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