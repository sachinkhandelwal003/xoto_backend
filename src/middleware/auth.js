const jwt = require("jsonwebtoken");
const { APIError } = require("../utils/errorHandler");
const { StatusCodes } = require("../utils/constants/statusCodes");

const User = require("../modules/auth/models/User");
const { Role } = require("../modules/auth/models/role/role.model");

const Vendorb2b = require("../modules/auth/models/Vendor/B2bvendor.model");
const Vendorb2c = require("../modules/auth/models/Vendor/B2cvendor.model");

const Business = require("../modules/auth/models/Freelancer/freelancerbusiness.model");
const Freelancer = require("../modules/auth/models/Freelancer/freelancer.model");

const AllUsers = require("../modules/auth/models/user/user.model");
const Customer = require("../modules/auth/models/user/customer.model");
const Agent =require("../modules/Agent/models/agent")
const Developer =require("../modules/properties/models/DeveloperModel")

const { getUserPermissions } = require("./permission");


/* ============================================================
   CREATE TOKEN
============================================================ */
exports.createToken = (user, type) => {
  const detectedType =
    type ||
    (user.constructor?.modelName
      ? user.constructor.modelName.toLowerCase()
      : "user");

  const payload = {
    id: user._id,
    email: user.email,
    type: detectedType,

    role: {
      id: user.role?._id || null,
      code: user.role?.code,
      name: user.role?.name,
      isSuperAdmin: user.role?.isSuperAdmin || false,
    }
  };

  // ⭐ Only freelancers get status added to the token
  if (detectedType === "freelancer") {
    payload.status = user.status_info?.status ?? 0;
  }

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "30d",
  });
};




/* ============================================================
   BASIC PROTECTOR FOR SINGLE MODEL
============================================================ */
const protectBase = (Model, name) => async (req, res, next) => {
  try {
    const token = req.headers.authorization?.startsWith("Bearer")
      ? req.headers.authorization.split(" ")[1]
      : null;
    console.log("tokennnnnnnnnnnnnnnnn",token)
    if (!token)
      throw new APIError("No token provided", StatusCodes.UNAUTHORIZED);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const entity = await Model.findById(decoded.id).populate(
      "role",
      "name code level isSuperAdmin"
    );
    console.log("entityentityentityentity",entity)

    if (!entity)
      throw new APIError(`${name} not found`, StatusCodes.UNAUTHORIZED);

    if (entity.isActive === false)
      throw new APIError(`${name} account inactive`, StatusCodes.UNAUTHORIZED);

    req.user = entity;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError")
      return next(new APIError("Invalid token", StatusCodes.UNAUTHORIZED));

    if (error.name === "TokenExpiredError")
      return next(new APIError("Token expired", StatusCodes.UNAUTHORIZED));

    next(error);
  }
};


/* ============================================================
   EXPORT SIMPLE PROTECTORS
============================================================ */
exports.protect = protectBase(User, "User");
exports.protectFreelancer = protectBase(Freelancer, "Freelancer");
exports.protectAccountant = protectBase(AllUsers, "Accountant");
exports.protectSupervisor = protectBase(AllUsers, "Supervisor");
exports.protectBusiness = protectBase(Business, "Business");
exports.protectVendorb2b = protectBase(Vendorb2b, "Vendor B2B");
exports.protectVendorb2c = protectBase(Vendorb2c, "Vendor-B2C");
exports.protectCustomer = protectBase(Customer, "Customer");



/* ============================================================
   MULTI-USER PROTECTOR (MAIN FIXED VERSION)
============================================================ */
exports.protectMulti = async (req, res, next) => {
  try {
    console.log("tokennnnnn",req.headers)
    const token = req.headers.authorization?.startsWith("Bearer")
      ? req.headers.authorization.split(" ")[1]
      : null;

    if (!token)
      throw new APIError("No token provided", StatusCodes.UNAUTHORIZED);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const type = decoded.type?.toLowerCase().replace(/\s/g, "");
    console.log("ecodedddddddddddddddddd",decoded)
    const entityMap = {
      user: User,
      allusers: AllUsers,
      accountant: AllUsers,
      supervisor: AllUsers,
      freelancer: Freelancer,
      business: Business,
      vendorb2b: Vendorb2b,
      vendorb2c: Vendorb2c,
      customer: Customer ,  // ⭐ ADDED HERE,
        agent: Agent,           // role code 16
  developer: Developer
    };

    const Model = entityMap[type];
    if (!Model)
      throw new APIError(
        `Invalid token type: ${decoded.type}`,
        StatusCodes.UNAUTHORIZED
      );

    let entity = await Model.findById(decoded.id).populate(
      "role",
      "name code level isSuperAdmin"
    );

    if (!entity)
      throw new APIError(
        "Unauthorized - Entity not found",
        StatusCodes.UNAUTHORIZED
      );

    if (!entity.role) {
      entity.role = decoded.role || {
        code: "guest",
        name: "Guest",
        level: 0,
        isSuperAdmin: false,
      };
    }

    if (entity.role._id) {
      try {
        entity.permissions = await getUserPermissions(entity.role._id);
      } catch {
        entity.permissions = [];
      }
    }

    req.user = entity;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError")
      return next(new APIError("Invalid token", StatusCodes.UNAUTHORIZED));

    if (error.name === "TokenExpiredError")
      return next(new APIError("Token expired", StatusCodes.UNAUTHORIZED));

    next(error);
  }
};




/* ============================================================
   ROLE-BASED AUTHORIZATION
============================================================ */
exports.authorize = ({ roles = [], minLevel } = {}) => {
  return (req, res, next) => {
    try {
      const role =
        req.user?.role || {
          code: "guest",
          name: "Guest",
          level: 0,
          isSuperAdmin: false,
        };

      if (role.isSuperAdmin) return next();

      if (minLevel && role.level < minLevel)
        throw new APIError("Insufficient role level", StatusCodes.FORBIDDEN);

      if (
        roles.length &&
        !roles.includes(role.code) &&
        !roles.includes(role.name)
      )
        throw new APIError("Role not allowed", StatusCodes.FORBIDDEN);

      next();
    } catch (error) {
      next(error);
    }
  };
};
