// controllers/user/user.controller.js
const User = require('../../models/user/user.model');
const bcrypt = require('bcryptjs');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const asyncHandler = require('../../../../utils/asyncHandler');
const { createToken } = require('../../../../middleware/auth');
const { Role } = require('../../models/role/role.model');
const Customer = require('../../models/user/customer.model')
const PropertyLead = require("../../models/consultant/propertyLead.model")
const mongoose = require('mongoose');

exports.userLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({
    email: email.toLowerCase(),
    is_deleted: false
  })
    .select('+password')
    .populate('role', 'name code isSuperAdmin');  // ⭐ FIXED

  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new APIError('Invalid email or password', StatusCodes.UNAUTHORIZED);
  }

  if (!user.isActive) {
    throw new APIError('Your account is deactivated', StatusCodes.FORBIDDEN);
  }

  const token = createToken(user);

  const userObj = user.toObject();
  delete userObj.password;

  res.json({ success: true, message: 'Login successful', token, user: userObj });
});

exports.customerLogin = asyncHandler(async (req, res) => {
  const { mobile } = req.body;
  console.log("req.bodyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy", mobile);
  if (!mobile) {
    throw new APIError("Mobile number is required", StatusCodes.BAD_REQUEST);
  }

  // Get Customer Role
  const customerRole = await Role.findOne({ name: "Customer" });
  if (!customerRole) {
    throw new APIError("Customer role not found", StatusCodes.NOT_FOUND);
  }

  // Find customer by mobile.number + role
  const customer = await Customer.findOne({
    mobile: mobile,
    role: customerRole._id,
    is_deleted: false
  }).populate("role", "name code");

  if (!customer) {
    throw new APIError("Customer not found", StatusCodes.NOT_FOUND);
  }

  if (!customer.isActive) {
    throw new APIError("Your account is deactivated", StatusCodes.FORBIDDEN);
  }

  // Generate Token
  const token = createToken(customer);

  res.json({
    success: true,
    message: "Customer login successful",
    token,
    customer
  });
});


exports.customerSignup = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    mobile,
    location,
    profile,
    comingFromAiPage
  } = req.body;

  // 🔴 Required fields check
  if (!name?.first_name || !name?.last_name || !email || !mobile?.number) {
    throw new APIError(
      "First name, last name, email, and mobile number are required",
      StatusCodes.BAD_REQUEST
    );
  }
  console.log("mobileeeeeeeeeeeeeeeeeee", mobile)

  // 🔍 Get Customer role
  const customerRole = await Role.findOne({ name: "Customer" });
  if (!customerRole) {
    throw new APIError("Customer role not found", StatusCodes.NOT_FOUND);
  }

  // 🔁 Check existing customer (email or mobile)
  const existingCustomer = await Customer.findOne({
    $or: [
      { email: email.toLowerCase() },
      { mobile: mobile }
      // { "mobile.number": mobile.number },
      // { "mobile.country_code": mobile.country_code }
    ],
    is_deleted: false
  });

  if (existingCustomer) {
    console.log("existingCustomerexistingCustomer", existingCustomer)
    return res.status(400).json([
      {
        status: 500,
        message: "Customer already exists with this email or mobile number"
      }
    ])
  }

  // 🧾 Create customer
  const customer = await Customer.create({
    name,
    email: email.toLowerCase(),
    mobile,
    role: customerRole._id,
    location,
    profile,
    isActive: true
  });

  await customer.populate("role", "name code");


  let lead = {};
  if (comingFromAiPage === true) {

    let new_location = location && typeof (location) == "object" ? Object.values(location).filter(Boolean).join(', ') : ""
    let payload = {
      type: 'ai_enquiry', // or 'enquiry' (your choice)
      name,
      email: email.toLowerCase(),
      mobile,
      location: new_location,
      preferred_contact: 'whatsapp',
      status: 'submit'
    }




    lead = await PropertyLead.create(payload);
  }

  // 🔐 Generate token
  const token = createToken(customer);

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Customer registered successfully",
    token,
    customer,
    lead
  });
});
exports.updateCustomer = asyncHandler(async (req, res) => {
  // 1. Get Customer ID 
  // (Assuming ye token se aayega req.user._id mein, ya fir req.query.id se)
  const customerId = req.user?._id || req.query?.id || req.params?.id;

  if (!customerId) {
    throw new APIError("Customer ID is required", StatusCodes.BAD_REQUEST);
  }

  // 2. Destructure fields from req.body (jo jo aayega)
  const { name, email, mobile, location, profilePic } = req.body;

  // 3. Find existing customer
  const customer = await Customer.findById(customerId);
  if (!customer || customer.is_deleted) {
    throw new APIError("Customer not found", StatusCodes.NOT_FOUND);
  }

  // 4. Duplicate Check for Email (Agar update ho raha hai)
  if (email && email.toLowerCase() !== customer.email) {
    const emailExists = await Customer.findOne({
      email: email.toLowerCase(),
      _id: { $ne: customerId }, // Khud ke alawa kisi aur ka na ho
      is_deleted: false
    });

    if (emailExists) {
      return res.status(400).json([{ status: 400, message: "Email already in use" }]);
    }
  }

  // 5. Duplicate Check for Mobile (Agar update ho raha hai)
  if (mobile && mobile.number && mobile.number !== customer.mobile?.number) {
    const mobileExists = await Customer.findOne({
      "mobile.number": mobile.number,
      _id: { $ne: customerId },
      is_deleted: false
    });

    if (mobileExists) {
      return res.status(400).json([{ status: 400, message: "Mobile number already in use" }]);
    }
  }

  // 6. Prepare Update Payload (Smart Merge for nested objects)
  // Spread operator (...) use kiya hai taaki purana data overwrite na ho jaye
  const updatePayload = {};
  
  if (name) updatePayload.name = { ...customer.name, ...name };
  if (email) updatePayload.email = email.toLowerCase();
  if (mobile) updatePayload.mobile = { ...customer.mobile, ...mobile };
  if (location) updatePayload.location = { ...customer.location, ...location };
  if (profilePic !== undefined) updatePayload.profilePic = profilePic; // Empty string aayi toh bhi update karega

  // 7. Update in DB
  const updatedCustomer = await Customer.findByIdAndUpdate(
    customerId,
    { $set: updatePayload },
    { new: true, runValidators: true } // new: true -> updated data return karega
  ).populate("role", "name code");

  // 8. Send Response
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Customer profile updated successfully",
    customer: updatedCustomer
  });
});

exports.createUser = asyncHandler(async (req, res) => {
  const { email, mobile, password, name, role: roleId } = req.body;

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await User.create({
    email: email.toLowerCase(),
    mobile,
    password: hashedPassword,
    name,
    role: roleId,
    isActive: true,
  });

  await user.populate('role', 'name');

  const userResponse = {
    _id: user._id,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    role: user.role.name,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'User created successfully',
    user: userResponse,
  });
});

exports.getAllUsers = asyncHandler(async (req, res) => {
  let { page = 1, limit, search = "", role, active } = req.query;

  const query = { is_deleted: false };

  // -----------------------------------------------------
  // ROLE FILTER (ObjectId OR name/slug/code allowed)
  // -----------------------------------------------------
  if (role) {
    // If NOT ObjectId → treat as role name/slug/code
    if (!mongoose.Types.ObjectId.isValid(role)) {
      const foundRole = await Role.findOne({
        $or: [
          { name: new RegExp(`^${role}$`, "i") },
          { slug: new RegExp(`^${role}$`, "i") },
          { code: new RegExp(`^${role}$`, "i") }
        ]
      }).lean();

      if (!foundRole) {
        return res.status(400).json({
          success: false,
          message: `Role '${role}' not found`,
        });
      }

      query.role = foundRole._id;
    } else {
      query.role = role; // already ObjectId
    }
  }

  // -----------------------------------------------------
  // ACTIVE FILTER
  // -----------------------------------------------------
  if (active !== undefined) {
    query.isActive = active === "true";
  }

  // -----------------------------------------------------
  // SEARCH FILTER
  // -----------------------------------------------------
  if (search) {
    const regex = new RegExp(search, "i");
    query.$or = [
      { "name.first_name": regex },
      { "name.last_name": regex },
      { email: regex },
      { mobile: regex },
    ];
  }

  // Base query
  let usersQuery = User.find(query)
    .select("-password")
    .populate("role", "name code slug isActive")
    .sort({ createdAt: -1 });

  // -----------------------------------------------------
  // CASE 1: NO LIMIT → return all users
  // -----------------------------------------------------
  if (!limit) {
    const users = await usersQuery.lean();
    return res.json({
      success: true,
      data: users,
      pagination: null,
    });
  }

  // -----------------------------------------------------
  // CASE 2: LIMIT PROVIDED → apply pagination
  // -----------------------------------------------------
  limit = Number(limit);
  page = Number(page);
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    usersQuery.skip(skip).limit(limit).lean(),
    User.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// exports.getAllUsers = asyncHandler(async (req, res) => {
//   let { page = 1, limit, search = "", role, active } = req.query;

//   const query = { is_deleted: false };

//   // -----------------------------------------------------
//   // ROLE FILTER (ObjectId OR name/slug/code allowed)
//   // -----------------------------------------------------
//   if (role) {
//     // If NOT ObjectId → treat as role name/slug/code
//     if (!mongoose.Types.ObjectId.isValid(role)) {
//       const foundRole = await Role.findOne({
//         $or: [
//           { name: new RegExp(`^${role}$`, "i") },
//           { slug: new RegExp(`^${role}$`, "i") },
//           { code: new RegExp(`^${role}$`, "i") }
//         ]
//       }).lean();

//       if (!foundRole) {
//         return res.status(400).json({
//           success: false,
//           message: `Role '${role}' not found`,
//         });
//       }

//       query.role = foundRole._id;
//     } else {
//       query.role = role; // already ObjectId
//     }
//   }

//   // -----------------------------------------------------
//   // ACTIVE FILTER
//   // -----------------------------------------------------
//   if (active !== undefined) {
//     query.isActive = active === "true";
//   }

//   // -----------------------------------------------------
//   // SEARCH FILTER
//   // -----------------------------------------------------
//   if (search) {
//     const regex = new RegExp(search, "i");
//     query.$or = [
//       { "name.first_name": regex },
//       { "name.last_name": regex },
//       { email: regex },
//       { mobile: regex },
//     ];
//   }

//   // Base query
//   let usersQuery = User.find(query)
//     .select("-password")
//     .populate("role", "name code slug isActive")
//     .sort({ createdAt: -1 });

//   // -----------------------------------------------------
//   // CASE 1: NO LIMIT → return all users
//   // -----------------------------------------------------
//   if (!limit) {
//     const users = await usersQuery.lean();
//     return res.json({
//       success: true,
//       data: users,
//       pagination: null,
//     });
//   }

//   // -----------------------------------------------------
//   // CASE 2: LIMIT PROVIDED → apply pagination
//   // -----------------------------------------------------
//   limit = Number(limit);
//   page = Number(page);
//   const skip = (page - 1) * limit;

//   const [users, total] = await Promise.all([
//     usersQuery.skip(skip).limit(limit).lean(),
//     User.countDocuments(query),
//   ]);

//   res.json({
//     success: true,
//     data: users,
//     pagination: {
//       page,
//       limit,
//       total,
//       totalPages: Math.ceil(total / limit),
//     },
//   });
// });


exports.toggleStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || user.is_deleted) throw new APIError('User not found', StatusCodes.NOT_FOUND);

  user.isActive = !user.isActive;
  await user.save();

  res.json({
    success: true,
    message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
    isActive: user.isActive,
  });
});

exports.softDelete = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new APIError('User not found', StatusCodes.NOT_FOUND);

  user.is_deleted = true;
  user.deleted_at = new Date();
  await user.save();

  res.json({ success: true, message: 'User deleted successfully' });
});


exports.restoreUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findOne({ _id: id, is_deleted: true });
  if (!user) {
    throw new APIError('Deleted user not found or already active', StatusCodes.NOT_FOUND);
  }

  user.is_deleted = false;
  user.deleted_at = null;
  user.isActive = true; // Optional: auto-activate on restore
  await user.save();

  res.json({
    success: true,
    message: 'User restored successfully',
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role: user.role,
      isActive: user.isActive,
    },
  });
});