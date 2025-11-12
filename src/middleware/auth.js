const jwt = require('jsonwebtoken');
const { APIError } = require('../utils/errorHandler');
const { StatusCodes } = require('../utils/constants/statusCodes');
const User = require('../modules/auth/models/User');
const { Role } = require('../modules/auth/models/role/role.model');
const Vendorb2b = require('../modules/auth/models/Vendor/B2bvendor.model');
const Vendorb2c = require('../modules/auth/models/Vendor/B2cvendor.model');
const Business = require('../modules/auth/models/Freelancer/freelancerbusiness.model');
const Freelancer = require('../modules/auth/models/Freelancer/freelancer.model');
const Customer = require('../modules/auth/models/Customer/customer.model');
const Accountant = require('../modules/auth/models/accountant/Accountant.model');

const { getUserPermissions } = require('./permission');


exports.createToken = (user, type) => {
  // Auto detect type from Mongoose model name if not provided
  const detectedType =
    type ||
    (user.constructor?.modelName
      ? user.constructor.modelName.toLowerCase()
      : 'user');

  const payload = {
    id: user._id,
    email: user.email,
    type: detectedType, // 'user', 'vendorb2c', 'freelancer', etc.
    role: {
      id: user.role?._id || null,
      code: user.role?.code,
      name: user.role?.name,
      isSuperAdmin: user.role?.isSuperAdmin || false,
    },
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '30d',
  });
};



const protectBase = (Model, name) => async (req, res, next) => {
  try {
    const token = req.headers.authorization?.startsWith('Bearer')
      ? req.headers.authorization.split(' ')[1]
      : null;

    if (!token) throw new APIError('No token provided', StatusCodes.UNAUTHORIZED);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const entity = await Model.findById(decoded.id).populate('role');

    if (!entity) throw new APIError(`${name} not found`, StatusCodes.UNAUTHORIZED);
    if ('isActive' in entity && entity.isActive === false)
      throw new APIError(`${name} account inactive`, StatusCodes.UNAUTHORIZED);

    // Default role to prevent authorize crashes
    entity.role = entity.role || { code: 'guest', name: 'Guest', level: 0 };

    // Attach permissions
    if (entity.role?._id) {
      try {
        entity.permissions = await getUserPermissions(entity.role._id);
      } catch {
        entity.permissions = [];
      }
    }

    req.user = entity;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError')
      return next(new APIError('Invalid token', StatusCodes.UNAUTHORIZED));
    if (error.name === 'TokenExpiredError')
      return next(new APIError('Token expired', StatusCodes.UNAUTHORIZED));

    next(error);
  }
};


exports.protect = protectBase(User, 'User');
exports.protectFreelancer = protectBase(Freelancer, 'Freelancer');
exports.protectFreelancer = protectBase(Accountant, 'Accountant');
exports.protectBusiness = protectBase(Business, 'Business');
exports.protectVendorb2b = protectBase(Vendorb2b, 'Vendor B2B');
exports.protectVendorb2c = protectBase(Vendorb2c, 'Vendor B2C');
exports.protectCustomer = protectBase(Customer, 'Customer');

// Protect multiple user types from a single middleware
exports.protectMulti = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.startsWith('Bearer')
      ? req.headers.authorization.split(' ')[1]
      : null;

    if (!token)
      throw new APIError('No token provided', StatusCodes.UNAUTHORIZED);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const type = decoded.type?.toLowerCase().replace(/\s/g, '');
    const entityMap = {
      user: User,
      freelancer: Freelancer,
            accountant: Accountant,
      business: Business,
      vendorb2b: Vendorb2b,
      vendorb2c: Vendorb2c,
      customer: Customer,
    };

    const Model = entityMap[type];
    if (!Model)
      throw new APIError(`Invalid token type: ${decoded.type}`, StatusCodes.UNAUTHORIZED);

    let entity = await Model.findById(decoded.id).populate('role');

    if (!entity)
      throw new APIError('Unauthorized - Entity not found', StatusCodes.UNAUTHORIZED);

    // Handle role fallback
    if (!entity.role) {
      // If decoded token has role info, use that
      if (decoded.role) {
        entity.role = decoded.role;
      } else {
        // Default guest role
        entity.role = { code: 'guest', name: 'Guest', level: 0, isSuperAdmin: false };
      }
    } else if (entity.role._id && !entity.role.code) {
      // If role is ObjectId but not populated fully, populate from DB
      const roleFromDb = await Role.findById(entity.role._id);
      entity.role = roleFromDb || { code: 'guest', name: 'Guest', level: 0, isSuperAdmin: false };
    }

    // Check if account is active
    if ('isActive' in entity && entity.isActive === false)
      throw new APIError('Unauthorized - Account inactive', StatusCodes.UNAUTHORIZED);

    // Attach permissions if role is valid
    if (entity.role?._id) {
      try {
        entity.permissions = await getUserPermissions(entity.role._id);
      } catch {
        entity.permissions = [];
      }
    }

    req.user = entity;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError')
      return next(new APIError('Invalid token', StatusCodes.UNAUTHORIZED));
    if (error.name === 'TokenExpiredError')
      return next(new APIError('Token expired', StatusCodes.UNAUTHORIZED));

    next(error);
  }
};




// Role-based authorization middleware
exports.authorize = ({ roles = [], minLevel } = {}) => {
  return (req, res, next) => {
    try {
      // ✅ Use default role to avoid null reference
      const role = req.user?.role || { code: 'guest', name: 'Guest', level: 0, isSuperAdmin: false };

      if (role.isSuperAdmin) return next();

      if (minLevel && role.level < minLevel)
        throw new APIError('Insufficient role level', StatusCodes.FORBIDDEN);

      if (roles.length && !roles.includes(role.code) && !roles.includes(role.name))
        throw new APIError('Role not allowed', StatusCodes.FORBIDDEN);

      next();
    } catch (error) {
      next(error);
    }
  };
};
