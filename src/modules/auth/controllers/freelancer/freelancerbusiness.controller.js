// controllers/business/business.controller.js

const winston = require('winston');
const BusinessRegistration = require('../../models/Freelancer/freelancerbusiness.model');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const asyncHandler = require('../../../../utils/asyncHandler');
const bcrypt = require('bcryptjs');
const { createToken } = require('../../../../middleware/auth');
const { Role } = require('../../models/role/role.model');

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/business.log' }),
    new winston.transports.Console()
  ]
});

// Business Login
exports.businessLogin = asyncHandler(async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find business and populate role
    const business = await BusinessRegistration.findOne({ email })
      .select('+password')
      .populate({
        path: 'role',
        model: Role,
      });

    if (!business) {
      throw new APIError('Invalid credentials', StatusCodes.UNAUTHORIZED);
    }

    // Compare hashed password
    const isMatch = await bcrypt.compare(password, business.password);
    if (!isMatch) {
      throw new APIError('Invalid credentials', StatusCodes.UNAUTHORIZED);
    }

    // Generate token
    const token = createToken(business);

    // Convert to object & remove password
    const businessResponse = business.toObject();
    delete businessResponse.password;

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Login successful',
      token,
      business: businessResponse,
    });
  } catch (error) {
    if (!error.message) error.message = 'Unidentified error';
    next(error);
  }
});

// Create Business
exports.createBusiness = asyncHandler(async (req, res, next) => {
  const businessData = req.body;

  // Validate required fields
  if (!businessData.email) {
    throw new APIError('Email is required', StatusCodes.BAD_REQUEST);
  }

  // Check duplicate business
  const existingBusiness = await BusinessRegistration.findOne({
    $or: [
      { email: businessData.email.toLowerCase().trim() },
      { mobile: businessData.mobile }
    ]
  });

  if (existingBusiness) {
    if (existingBusiness.email === businessData.email.toLowerCase().trim()) {
      logger.warn(`Business creation failed: Duplicate email - ${businessData.email}`);
      throw new APIError('Business email already exists', StatusCodes.CONFLICT);
    }
    if (existingBusiness.mobile === businessData.mobile) {
      logger.warn(`Business creation failed: Duplicate mobile - ${businessData.mobile}`);
      throw new APIError('Business mobile number already exists', StatusCodes.CONFLICT);
    }
  }

  // Mobile verification check
  if (!businessData.is_mobile_verified) {
    throw new APIError('Mobile must be verified', StatusCodes.BAD_REQUEST);
  }

  const businessRole = await Role.findOne({ name: 'Freelancer-Business' });
  if (!businessRole) {
    throw new APIError('Business role not available', StatusCodes.NOT_FOUND);
  }
  businessData.role = businessRole._id;

  // Ensure status_info exists
  businessData.status_info = businessData.status_info || {};
  businessData.status_info.status = 0; // 0 = pending

  // Hash password
  businessData.password = await bcrypt.hash(businessData.password, 10);

  // Parse categories if sent as string
  if (businessData.store_details && businessData.store_details.categories) {
    let parsedCategories = businessData.store_details.categories;
    if (typeof parsedCategories === 'string') {
      try {
        parsedCategories = JSON.parse(parsedCategories);
        businessData.store_details.categories = parsedCategories;
      } catch (error) {
        throw new APIError('Invalid categories format', StatusCodes.BAD_REQUEST);
      }
    }

    // Validate categories structure
    if (!Array.isArray(businessData.store_details.categories) ||
        businessData.store_details.categories.length === 0) {
      throw new APIError('At least one category is required', StatusCodes.BAD_REQUEST);
    }

    for (const category of businessData.store_details.categories) {
      if (!category.name || typeof category.name !== 'string') {
        throw new APIError('Each category must have a valid name', StatusCodes.BAD_REQUEST);
      }
    }
  }

  // Handle logo upload
  if (req.files && req.files.logo) {
    businessData.store_details = businessData.store_details || {};
    businessData.store_details.logo = req.files.logo[0].path;
  }

  // Handle uploaded documents
  businessData.documents = {};

  if (req.files) {
    const fileHandlers = {
      identityProof: () => {
        businessData.documents.identity_proof = {
          type: 'identity_proof',
          path: req.files.identityProof[0].path,
          verified: false,
          uploaded_at: new Date()
        };
      },
      addressProof: () => {
        businessData.documents.address_proof = {
          type: 'address_proof',
          path: req.files.addressProof[0].path,
          verified: false,
          uploaded_at: new Date()
        };
      },
      gstCertificate: () => {
        businessData.documents.gst_certificate = {
          type: 'gst_certificate',
          path: req.files.gstCertificate[0].path,
          verified: false,
          uploaded_at: new Date()
        };
      },
      businessLicense: () => {
        businessData.documents.business_license = {
          type: 'business_license',
          path: req.files.businessLicense[0].path,
          verified: false,
          uploaded_at: new Date()
        };
      }
    };

    Object.keys(req.files).forEach(fileType => {
      if (fileHandlers[fileType]) {
        fileHandlers[fileType]();
      }
    });
  }

  // Validate at least one document is provided
  const hasDocuments = Object.keys(businessData.documents).some(key => {
    const doc = businessData.documents[key];
    return doc !== undefined;
  });

  if (!hasDocuments) {
    throw new APIError('At least one document is required', StatusCodes.BAD_REQUEST);
  }

  try {
    // Create business
    const business = await BusinessRegistration.create(businessData);

    // Log creation in change history
    business.meta.change_history = business.meta.change_history || [];
    business.meta.change_history.push({
      updated_by: req.user?._id || null, // If created by admin, req.user may be available
      updated_at: new Date(),
      changes: ['Business created']
    });
    await business.save();

    logger.info(`Business created successfully: ${business._id}`);

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Business created successfully',
      data: {
        business: {
          id: business._id,
          email: business.email,
          full_name: business.full_name,
          store_details: business.store_details,
          status: business.status_info.status
        }
      }
    });
  } catch (error) {
    logger.error(`Business creation failed: ${error.message}`);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      throw new APIError(`Validation failed: ${errors.join(', ')}`, StatusCodes.BAD_REQUEST);
    }

    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      throw new APIError(`${field} already exists`, StatusCodes.CONFLICT);
    }

    throw new APIError('Server error while creating business', StatusCodes.INTERNAL_SERVER_ERROR);
  }
});

// Get All Businesses
exports.getAllBusinesses = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 10, status, businessId } = req.query;

  if (businessId) {
    try {
      const business = await BusinessRegistration.findById(businessId)
        .select('-password')
        .lean();

      if (!business) {
        return res.status(StatusCodes.NOT_FOUND).json({
          success: false,
          message: 'Business not found'
        });
      }

      logger.info(`Retrieved business with ID: ${businessId}`);
      return res.status(StatusCodes.OK).json({
        success: true,
        business
      });
    } catch (error) {
      if (error.name === 'CastError') {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: 'Invalid business ID format'
        });
      }
      next(error);
    }
  }

  const query = status ? { 'status_info.status': parseInt(status) } : {};

  const businesses = await BusinessRegistration.find(query)
    .select('-password')
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();

  const total = await BusinessRegistration.countDocuments(query);

  logger.info(`Retrieved ${businesses.length} businesses`);
  res.status(StatusCodes.OK).json({
    success: true,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total
    },
    businesses,
  });
});

// Get Business Profile
exports.getBusinessProfile = asyncHandler(async (req, res, next) => {
  try {
            console.log("✅ Vendor ID from req.user:", req.user?.id); // 👈 Debug log

    const business = await BusinessRegistration.findById(req.user.id).populate('role').lean();
    if (!business) {
      throw new APIError('Business not found', StatusCodes.NOT_FOUND);
    }

    delete business.password;

    res.status(StatusCodes.OK).json({
      success: true,
      business,
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

    const business = await BusinessRegistration.findById(req.user.id).select('+password');

    if (!business) {
      throw new APIError('Business not found', StatusCodes.NOT_FOUND);
    }

    const isMatch = await bcrypt.compare(currentPassword, business.password);
    if (!isMatch) {
      throw new APIError('Current password is incorrect', StatusCodes.UNAUTHORIZED);
    }

    business.password = await bcrypt.hash(newPassword, 10);

    business.meta.updated_at = Date.now();
    business.meta.change_history = business.meta.change_history || [];
    business.meta.change_history.push({
      updated_by: req.user._id,
      updated_at: new Date(),
      changes: ['Password changed']
    });

    await business.save();

    logger.info(`Password changed for business: ${business._id}`);
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

    const business = await BusinessRegistration.findById(req.user.id);

    if (!business) {
      throw new APIError('Business not found', StatusCodes.NOT_FOUND);
    }

    let document = null;
    let documentField = null;

    for (const [type, docField] of Object.entries(business.documents.toObject())) {
      if (docField && docField._id?.toString() === documentId) {
        document = business.documents[type];
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

    business.meta.updated_at = new Date();
    business.meta.change_history = business.meta.change_history || [];
    business.meta.change_history.push({
      updated_by: req.user._id,
      updated_at: new Date(),
      changes: [`Document ${documentField} path updated`]
    });

    await business.save();

    logger.info(`Document ${documentId} path updated for business: ${business._id}`);
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Document path updated successfully',
      business: {
        id: business._id,
        documents: business.documents
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

// Update Business
exports.updateBusiness = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    logger.warn('Unauthorized business update attempt');
    throw new APIError('Unauthorized: User not found', StatusCodes.UNAUTHORIZED);
  }

  const business = await BusinessRegistration.findById(req.params.id);
  if (!business) {
    logger.warn(`Business not found for update: ${req.params.id}`);
    throw new APIError('Business not found', StatusCodes.NOT_FOUND);
  }

  const updatedData = req.body;
  if (updatedData.email && updatedData.email !== business.email) {
    const existingBusiness = await BusinessRegistration.findOne({ email: updatedData.email });
    if (existingBusiness) {
      logger.warn(`Update failed: Email already in use - ${updatedData.email}`);
      throw new APIError('Email already in use', StatusCodes.CONFLICT);
    }
  }

  Object.assign(business, updatedData);
  business.meta.updated_at = Date.now();
  business.meta.change_history = business.meta.change_history || [];
  business.meta.change_history.push({
    updated_by: req.user._id,
    updated_at: new Date(),
    changes: Object.keys(updatedData).map(key => `${key} updated`)
  });

  const updatedBusiness = await business.save();

  logger.info(`Business updated successfully: ${business._id}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Business updated successfully',
    business: {
      id: updatedBusiness._id,
      email: updatedBusiness.email,
      full_name: updatedBusiness.full_name,
      store_details: updatedBusiness.store_details
    }
  });
});

// Delete Business
exports.deleteBusiness = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    logger.warn('Unauthorized business deletion attempt');
    throw new APIError('Unauthorized: User not found', StatusCodes.UNAUTHORIZED);
  }

  const business = await BusinessRegistration.findById(req.params.id);
  if (!business) {
    logger.warn(`Business not found for deletion: ${req.params.id}`);
    throw new APIError('Business not found', StatusCodes.NOT_FOUND);
  }

  business.meta.updated_at = new Date();
  business.meta.change_history = business.meta.change_history || [];
  business.meta.change_history.push({
    updated_by: req.user._id,
    updated_at: new Date(),
    changes: ['Business deleted']
  });

  await business.save();
  await business.deleteOne();

  logger.info(`Business deleted successfully: ${business._id}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Business deleted successfully'
  });
});

// Update Business Status
exports.updateBusinessStatus = asyncHandler(async (req, res, next) => {
  const { status, rejection_reason } = req.body;

  const business = await BusinessRegistration.findById(req.params.id);
  if (!business) {
    logger.warn(`Business not found for status update: ${req.params.id}`);
    throw new APIError('Business not found', StatusCodes.NOT_FOUND);
  }

  business.status_info.status = parseInt(status);
  business.status_info.rejection_reason = rejection_reason || business.status_info.rejection_reason;
  if (status === 1) {
    business.status_info.approved_at = Date.now();
    business.status_info.approved_by = req.user._id;
  }

  business.meta.updated_at = new Date();
  business.meta.change_history = business.meta.change_history || [];
  business.meta.change_history.push({
    updated_by: req.user._id,
    updated_at: new Date(),
    changes: [`Status updated to ${status}`]
  });

  await business.save();

  logger.info(`Business status updated: ${business._id}, status: ${status}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Business status updated',
    business: {
      id: business._id,
      status_info: business.status_info
    }
  });
});

// Update Document Verification
exports.updateDocumentVerification = asyncHandler(async (req, res) => {
  const { businessId, documentId, verified, reason, suggestion } = req.body;

  const business = await BusinessRegistration.findById(businessId);
  if (!business) {
    throw new APIError('Business not found', StatusCodes.NOT_FOUND);
  }

  let document = null;
  let documentField = null;

  for (const [type, docField] of Object.entries(business.documents.toObject())) {
    if (docField && docField._id?.toString() === documentId) {
      document = business.documents[type];
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

  business.meta.updated_at = new Date();
  business.meta.change_history = business.meta.change_history || [];
  business.meta.change_history.push({
    updated_by: req.user?._id,
    updated_at: new Date(),
    changes: [
      `Document ${documentField} verification set to ${verified ? 'APPROVED' : 'REJECTED'}`
    ]
  });

  await business.save();

  logger.info(`Document verification updated for business: ${business._id}, document: ${documentField}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: verified
      ? 'Document approved successfully'
      : 'Document rejected, please re-upload',
    business: {
      id: business._id,
      documents: business.documents
    }
  });
});

// Get Change History
exports.getChangeHistory = asyncHandler(async (req, res, next) => {
  try {
    const { businessId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const business = await BusinessRegistration.findById(businessId)
      .select('meta.change_history')
      .lean();

    if (!business) {
      logger.warn(`Business not found for change history: ${businessId}`);
      throw new APIError('Business not found', StatusCodes.NOT_FOUND);
    }

    const changeHistory = business.meta.change_history || [];
    const total = changeHistory.length;

    // Paginate the change history
    const startIndex = (page - 1) * limit;
    const paginatedHistory = changeHistory.slice(startIndex, startIndex + Number(limit));

    logger.info(`Retrieved change history for business: ${businessId}, page: ${page}, limit: ${limit}`);
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
      logger.warn(`Invalid business ID format: ${businessId}`);
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Invalid business ID format'
      });
    }
    if (!error.message) error.message = 'Unidentified error';
    next(error);
  }
});