const winston = require('winston');
const VendorB2B = require('../../models/Vendor/B2bvendor.model');
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
    new winston.transports.File({ filename: 'logs/vendor.log' }),
    new winston.transports.Console()
  ]
});

exports.vendorLogin = asyncHandler(async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find vendor and populate role from status_info.role
    const vendor = await VendorB2B.findOne({ email })
      .select("+password")
      .populate({
        path: "role", // ✅ nested role check
        model: Role,
      });

    if (!vendor) {
      throw new APIError("Invalid credentials", StatusCodes.UNAUTHORIZED);
    }

    // Direct string compare since password is NOT hashed
    if (vendor.password !== password) {
      throw new APIError("Invalid credentials", StatusCodes.UNAUTHORIZED);
    }

    // 👉 Debug log to check populated role
    console.log("Vendor role populated:", vendor.status_info?.role);

    // Generate token
    const token = createToken(vendor);

    // Convert to object & remove password
    const vendorResponse = vendor.toObject();
    delete vendorResponse.password;

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Login successful",
      token,
      vendor: vendorResponse,
    });
  } catch (error) {
    if (!error.message) {
      error.message = "Unidentified error";
    }
    next(error);
  }
});




exports.createVendor = asyncHandler(async (req, res, next) => {
  const vendorData = req.body;
  console.log(vendorData)

  // Validate required fields
  if (!vendorData.email) {
    throw new APIError('Email is required', StatusCodes.BAD_REQUEST);
  }

  // Check duplicate vendor
  const existingVendor = await VendorB2B.findOne({ 
    $or: [
      { email: vendorData.email.toLowerCase().trim() },
      { mobile: vendorData.mobile }
    ]
  });
  
  if (existingVendor) {
    if (existingVendor.email === vendorData.email.toLowerCase().trim()) {
      logger.warn(`Vendor creation failed: Duplicate email - ${vendorData.email}`);
      throw new APIError('Vendor email already exists', StatusCodes.CONFLICT);
    }
    if (existingVendor.mobile === vendorData.mobile) {
      logger.warn(`Vendor creation failed: Duplicate mobile - ${vendorData.mobile}`);
      throw new APIError('Vendor mobile number already exists', StatusCodes.CONFLICT);
    }
  }

// Mobile verification check
if (!vendorData.is_mobile_verified) {
  throw new APIError('Mobile must be verified', StatusCodes.BAD_REQUEST);
}

const vendorRole = await Role.findOne({ name: 'Vendor-B2B' });
if (!vendorRole) {
  throw new APIError('Vendor role not available', StatusCodes.NOT_FOUND);
}
vendorData.role = vendorRole._id;

// Ensure status_info exists and assign role
vendorData.status_info = vendorData.status_info || {};
vendorData.status_info.status = 0; // e.g. 0 = pending, 1 = active, etc.

// Ensure compliance exists and set blacklist_status
vendorData.compliance = vendorData.compliance || {};
vendorData.compliance.blacklist_status = false;


  // Parse categories if they are sent as string
  if (vendorData.business_details && vendorData.business_details.categories) {
    let parsedCategories = vendorData.business_details.categories;
    if (typeof parsedCategories === 'string') {
      try {
        parsedCategories = JSON.parse(parsedCategories);
        vendorData.business_details.categories = parsedCategories;
      } catch (error) {
        throw new APIError('Invalid categories format', StatusCodes.BAD_REQUEST);
      }
    }
    
    // Validate categories structure
    if (!Array.isArray(vendorData.business_details.categories) || 
        vendorData.business_details.categories.length === 0) {
      throw new APIError('At least one category is required', StatusCodes.BAD_REQUEST);
    }
    
    for (const category of vendorData.business_details.categories) {
      if (!category.name || typeof category.name !== 'string') {
        throw new APIError('Each category must have a valid name', StatusCodes.BAD_REQUEST);
      }
    }
  }
  if (req.files && req.files.logo) {
    vendorData.business_details = vendorData.business_details || {};
    vendorData.business_details.logo = req.files.logo[0].path;
  }
  // Handle uploaded documents
  vendorData.documents = {};
  
  if (req.files) {
    const fileHandlers = {
      identityProof: () => {
        vendorData.documents.identity_proof = {
          type: 'identity_proof',
          path: req.files.identityProof[0].path,
          verified: false,
          uploaded_at: new Date()
        };
      },
      addressProof: () => {
        vendorData.documents.address_proof = {
          type: 'address_proof',
          path: req.files.addressProof[0].path,
          verified: false,
          uploaded_at: new Date()
        };
      },
      businessProof: () => {
        vendorData.documents.business_proof = {
          type: 'business_proof',
          path: req.files.businessProof[0].path,
          verified: false,
          uploaded_at: new Date()
        };
      },
      gstCertificate: () => {
        vendorData.documents.gst_certificate = {
          type: 'gst_certificate',
          path: req.files.gstCertificate[0].path,
          verified: false,
          uploaded_at: new Date()
        };
      },
      cancelledCheque: () => {
        vendorData.documents.cancelled_cheque = {
          type: 'cancelled_cheque',
          path: req.files.cancelledCheque[0].path,
          verified: false,
          uploaded_at: new Date()
        };
      },
      additional: () => {
        vendorData.documents.compliance_documents = req.files.additional.map(file => ({
          type: 'compliance',
          path: file.path,
          verified: false,
          uploaded_at: new Date()
        }));
      }
    };

    // Process each file type
    Object.keys(req.files).forEach(fileType => {
      if (fileHandlers[fileType]) {
        fileHandlers[fileType]();
      }
    });
  }

  // Validate at least one document is provided
  const hasDocuments = Object.keys(vendorData.documents).some(key => {
    const doc = vendorData.documents[key];
    return Array.isArray(doc) ? doc.length > 0 : doc !== undefined;
  });

  if (!hasDocuments) {
    throw new APIError('At least one document is required', StatusCodes.BAD_REQUEST);
  }

  try {
    // Create vendor
    const vendor = await VendorB2B.create(vendorData);

    logger.info(`Vendor created successfully: ${vendor._id}`);
    
    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Vendor created successfully',
      data: {
        vendor: {
          id: vendor._id,
          email: vendor.email,
          full_name: vendor.full_name,
          business_details: vendor.business_details,
          status: vendor.status_info.status
        }
      }
    });
  } catch (error) {
    logger.error(`Vendor creation failed: ${error.message}`);
    
    // Handle MongoDB validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      throw new APIError(`Validation failed: ${errors.join(', ')}`, StatusCodes.BAD_REQUEST);
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      throw new APIError(`${field} already exists`, StatusCodes.CONFLICT);
    }
    
    // Handle other errors
    throw new APIError('Server error while creating vendor', StatusCodes.INTERNAL_SERVER_ERROR);
  }
});



exports.getAllVendors = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 10, status, vendorId } = req.query;
  
  // If vendorId is provided, fetch single vendor without pagination
  if (vendorId) {
    try {
      const vendor = await VendorB2B.findById(vendorId)
        .select('-password') // Exclude sensitive data
        .lean();

      // Check if vendor exists
      if (!vendor) {
        return res.status(StatusCodes.NOT_FOUND).json({
          success: false,
          message: 'Vendor not found'
        });
      }

      logger.info(`Retrieved vendor with ID: ${vendorId}`);
      return res.status(StatusCodes.OK).json({
        success: true,
        vendor
      });
    } catch (error) {
      // Handle invalid ObjectId format
      if (error.name === 'CastError') {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: 'Invalid vendor ID format'
        });
      }
      // Pass other errors to the error handler
      next(error);
    }
  }

  // If no vendorId provided, fetch all vendors with pagination
  const query = status ? { 'status_info.status': parseInt(status) } : {};

  const vendors = await VendorB2B.find(query)
    .select('-password') // Exclude sensitive data
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();

  const total = await VendorB2B.countDocuments(query);

  logger.info(`Retrieved ${vendors.length} vendors`);
  res.status(StatusCodes.OK).json({
    success: true,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total
    },
    vendors,
  });
});







exports.getVendorProfile = asyncHandler(async (req, res, next) => {
  try {
        console.log("✅ Vendor ID from req.user:", req.user?.id); // 👈 Debug log

    const vendor = await VendorB2B.findById(req.user.id).populate('role').lean();
    if (!vendor) {
      throw new APIError('Vendor not found', StatusCodes.NOT_FOUND);
    }

    delete vendor.password; // Ensure password is not sent

    res.status(StatusCodes.OK).json({
      success: true,
      vendor,
    });
  } catch (error) {
    if (!error.message) error.message = 'Unidentified error';
    next(error);
  }
});

 


exports.changePassword = asyncHandler(async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Check if new passwords match
    if (newPassword !== confirmPassword) {
      throw new APIError('New passwords do not match', StatusCodes.BAD_REQUEST);
    }

    // Find vendor with password included
    const vendor = await VendorB2B.findById(req.user.id).select('+password');

    if (!vendor) {
      throw new APIError('Vendor not found', StatusCodes.NOT_FOUND);
    }

    // Compare plain text passwords
    if (vendor.password !== currentPassword) {
      throw new APIError('Current password is incorrect', StatusCodes.UNAUTHORIZED);
    }

    // Update with new plain password
    vendor.password = newPassword;

    // Update meta and add change history
    vendor.meta.updated_at = Date.now();
    vendor.meta.change_history.push({
      updated_by: req.user._id,
      changes: [`Password changed`]
    });

    await vendor.save();

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    if (!error.message) error.message = 'Unidentified error';
    next(error);
  }
});

exports.updateDocument = asyncHandler(async (req, res, next) => {
  try {
    const { documentId } = req.params;

    if (!req.file) {
      throw new APIError('File is required for update', StatusCodes.BAD_REQUEST);
    }

    const vendor = await VendorB2B.findById(req.user.id);

    if (!vendor) {
      throw new APIError('Vendor not found', StatusCodes.NOT_FOUND);
    }

    let document = null;
    let documentField = null;

    // Search for the document in all document fields
    for (const [type, docField] of Object.entries(vendor.documents.toObject())) {
      if (docField && docField._id?.toString() === documentId) {
        document = vendor.documents[type];
        documentField = type;
        break;
      }
      if (Array.isArray(docField)) {
        const foundDoc = docField.find(d => d._id?.toString() === documentId);
        if (foundDoc) {
          document = foundDoc;
          documentField = type;
          break;
        }
      }
    }

    if (!document) {
      throw new APIError('Document not found', StatusCodes.NOT_FOUND);
    }

    if (document.verified) {
      throw new APIError('Cannot update verified document', StatusCodes.FORBIDDEN);
    }

    // Update only the file path
    document.path = req.file.path;

    // Update meta information
    vendor.meta.updated_at = new Date();
    vendor.meta.change_history.push({
      updated_by: req.user._id,
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



exports.updateVendor = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    logger.warn('Unauthorized vendor update attempt'); 
    throw new APIError('Unauthorized: User not found', StatusCodes.UNAUTHORIZED);
  }

  const vendor = await VendorB2B.findById(req.params.id);
  if (!vendor) {
    logger.warn(`Vendor not found for update: ${req.params.id}`);
    throw new APIError('Vendor not found', StatusCodes.NOT_FOUND);
  }

  const updatedData = req.body;
  if (updatedData.email && updatedData.email !== vendor.email) {
    const existingVendor = await VendorB2B.findOne({ email: updatedData.email });
    if (existingVendor) {
      logger.warn(`Update failed: Email already in use - ${updatedData.email}`);
      throw new APIError('Email already in use', StatusCodes.CONFLICT);
    }
  }
  if (updatedData.vendor_id && updatedData.vendor_id !== vendor.vendor_id) {
    const existingVendor = await VendorB2B.findOne({ vendor_id: updatedData.vendor_id });
    if (existingVendor) {
      logger.warn(`Update failed: Vendor ID already in use - ${updatedData.vendor_id}`);
      throw new APIError('Vendor ID already in use', StatusCodes.CONFLICT);
    }
  }

  Object.assign(vendor, updatedData);
  vendor.meta.updated_at = Date.now();
  vendor.meta.change_history.push({
    updated_by: req.user._id,
    changes: Object.keys(updatedData).map(key => `${key} updated`)
  });

  const updatedVendor = await vendor.save();

  logger.info(`Vendor updated successfully: ${vendor._id}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Vendor updated successfully',
    vendor: {
      id: updatedVendor._id,
      vendor_id: updatedVendor.vendor_id,
      email: updatedVendor.email,
      full_name: updatedVendor.full_name,
      business_details: updatedVendor.business_details
    }
  });
});

exports.deleteVendor = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    logger.warn('Unauthorized vendor deletion attempt');
    throw new APIError('Unauthorized: User not found', StatusCodes.UNAUTHORIZED);
  }

  const vendor = await VendorB2B.findById(req.params.id);
  if (!vendor) {
    logger.warn(`Vendor not found for deletion: ${req.params.id}`);
    throw new APIError('Vendor not found', StatusCodes.NOT_FOUND);
  }

  await vendor.deleteOne();

  logger.info(`Vendor deleted successfully: ${vendor._id}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Vendor deleted successfully'
  });
});

exports.updateVendorStatus = asyncHandler(async (req, res, next) => {
 

  const { status, rejection_reason } = req.body;

  const vendor = await VendorB2B.findById(req.params.id);
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

  vendor.meta.updated_at = Date.now();
  vendor.meta.change_history.push({
    updated_by: req.user._id,
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





exports.updateDocumentVerification = asyncHandler(async (req, res) => {
  const { vendorId, documentId, verified, reason, suggestion } = req.body;

  const vendor = await VendorB2B.findById(vendorId);
  if (!vendor) {
    throw new APIError('Vendor not found', StatusCodes.NOT_FOUND);
  }

  let document = null;
  let documentField = null;

  // Loop through vendor.documents
  for (const [type, docField] of Object.entries(vendor.documents.toObject())) {
    if (docField && docField._id?.toString() === documentId) {
      document = vendor.documents[type];
      documentField = type;
      break;
    }
    if (Array.isArray(docField)) {
      const foundDoc = docField.find(d => d._id?.toString() === documentId);
      if (foundDoc) {
        document = foundDoc;
        documentField = type;
        break;
      }
    }
  }

  if (!document) {
    throw new APIError(
      'Document not found or not uploaded properly. Please re-upload.',
      StatusCodes.BAD_REQUEST
    );
  }

  // ✅ Approve or reject
  if (verified) {
    document.verified = true;
    document.reason = null;
    document.suggestion = null;
  } else {
    document.verified = false;
    document.reason = reason || 'Document not valid';
    document.suggestion = suggestion || 'Please re-upload with correct details';
  }

  // ✅ Update meta
  vendor.meta.updated_at = new Date();
  vendor.meta.change_history.push({
    updated_by: req.user?._id,
    changes: [
      `Document ${documentField} verification set to ${verified ? 'APPROVED' : 'REJECTED'}`
    ]
  });

  await vendor.save();

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

