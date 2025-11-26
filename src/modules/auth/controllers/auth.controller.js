const { StatusCodes } = require('../../../utils/constants/statusCodes');
const { APIError } = require('../../../utils/errorHandler');
const User = require('../models/User');
const { Role } = require('../models/role/role.model');
const asyncHandler = require('../../../utils/asyncHandler');
const bcrypt = require('bcryptjs');
const { createToken } = require('../../../middleware/auth');

// Create a new user
exports.createUser = asyncHandler(async (req, res) => {
  const { email, password, role: roleId, status } = req.body;

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user
  const user = await User.create({
    email,
    password: hashedPassword,
    role: roleId,
    status: status || 1,
    isActive: true
  });

  // Populate role details in response
  const userWithRole = await User.findById(user._id).populate({
    path: 'role',
    select: 'code name isSuperAdmin'
  });

  // Return user without password
  const userResponse = userWithRole.toObject();
  delete userResponse.password;

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: userWithRole.role.code === '0' ? 'SuperAdmin created successfully' : 'User created successfully',
    user: userResponse
  });
});

// Get all users
exports.getAllUsers = asyncHandler(async (req, res) => {stat
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.isActive) filter.isActive = req.query.isActive === 'true';

  // Use aggregation to filter out superadmin users (role code 0)
  const aggregationPipeline = [
    {
      $lookup: {
        from: 'roles',
        localField: 'role',
        foreignField: '_id',
        as: 'roleInfo'
      }
    },
    {
      $unwind: {
        path: '$roleInfo',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $match: {
        ...filter,
        'roleInfo.code': { $ne: 0 } // Exclude superadmin (code 0)
      }
    },
    {
      $sort: { createdAt: -1 }
    },
    {
      $skip: skip
    },
    {
      $limit: limit
    },
    {
      $project: {
        password: 0,
        roleInfo: 0
      }
    },
    {
      $lookup: {
        from: 'roles',
        localField: 'role',
        foreignField: '_id',
        as: 'role'
      }
    },
    {
      $unwind: {
        path: '$role',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $project: {
        'role.code': 1,
        'role.name': 1,
        // include other user fields you need
        name: 1,
        email: 1,
        status: 1,
        isActive: 1,
        createdAt: 1,
        updatedAt: 1
      }
    }
  ];

  const users = await User.aggregate(aggregationPipeline);

  // For count, we need a separate query
  const countAggregation = [
    {
      $lookup: {
        from: 'roles',
        localField: 'role',
        foreignField: '_id',
        as: 'roleInfo'
      }
    },
    {
      $unwind: {
        path: '$roleInfo',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $match: {
        ...filter,
        'roleInfo.code': { $ne: 0 } // Exclude superadmin (code 0)
      }
    },
    {
      $count: 'total'
    }
  ];

  const totalResult = await User.aggregate(countAggregation);
  const totalCount = totalResult.length > 0 ? totalResult[0].total : 0;

  res.status(StatusCodes.OK).json({
    success: true,
    count: users.length,
    message: `${users.length} users found`,
    pagination: {
      totalRecords: totalCount,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      perPage: limit
    },
    users
  });
});
// Login user
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user with password & role populated
  const user = await User.findOne({ email })
    .select('+password')
    .populate({
      path: 'role',
      select: 'code name isSuperAdmin level',
    });

  if (!user) {
    throw new APIError('Invalid email or password', StatusCodes.UNAUTHORIZED);
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new APIError('Invalid email or password', StatusCodes.UNAUTHORIZED);
  }

  // Check account status
  if (!user.isActive) {
    throw new APIError('Account is deactivated', StatusCodes.FORBIDDEN);
  }
 
  // Generate token
  const token = createToken(user);

  // Remove sensitive fields
  const userObj = user.toObject();
  delete userObj.password;

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Login successful',
    token,
    user: userObj,
  });
});
// Get current logged-in user
exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).populate({
    path: 'role',
    model: Role
  });

  res.status(StatusCodes.OK).json({
    success: true,
    user
  });
});