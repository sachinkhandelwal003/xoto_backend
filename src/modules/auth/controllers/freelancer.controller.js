const { StatusCodes } = require('../../../utils/constants/statusCodes');
const { APIError } = require('../../../utils/errorHandler');
const FreelancerRequest = require('../models/Customer/freelancer.model');
const Customer = require('../models/Customer/customer.model');

// Customer submits freelancer request
exports.submitFreelancerRequest = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { skills, hourlyRate, portfolio } = req.body;

    // Check if customer exists
    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new APIError('Customer not found', StatusCodes.NOT_FOUND);
    }

    // Check if already a freelancer
    if (customer.isFreelancer) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Customer is already a freelancer',
      });
    }

    // Check if pending request exists
    const existingRequest = await FreelancerRequest.findOne({
      customerId,
      status: 0, // pending
    });
    if (existingRequest) {
      return res.status(StatusCodes.CONFLICT).json({
        success: false,
        message: 'Customer already has a pending freelancer request',
      });
    }

    // Create new request
    const freelancerRequest = await FreelancerRequest.create({
      customerId,
      skills,
      hourlyRate,
      portfolio,
      status: 0, // pending
    });

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Freelancer request submitted for admin approval',
      requestId: freelancerRequest._id,
    });
  } catch (err) {
    console.error('Error in submitFreelancerRequest:', err); // Debug log
    res.status(err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: err.message,
    });
  }
};

// Admin approves freelancer request
exports.approveFreelancerRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const adminId = req.user.id;

    const request = await FreelancerRequest.findById(requestId).populate('customerId');
    if (!request) {
      throw new APIError('Freelancer request not found', StatusCodes.NOT_FOUND);
    }

    if (request.status !== 0) {
      throw new APIError('Request has already been processed', StatusCodes.BAD_REQUEST);
    }

    // Update request status
    request.status = 1; // approved
    request.approvedAt = new Date();
    request.approvedBy = adminId;
    await request.save();

    // Update customer - set isFreelancer to true
    await Customer.findByIdAndUpdate(request.customerId._id, {
      isFreelancer: true,
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: `Freelancer request approved. ${request.customerId.name} is now a freelancer.`,
    });
  } catch (err) {
    console.error('Error in approveFreelancerRequest:', err); // Debug log
    res.status(err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: err.message,
    });
  }
};

// Admin rejects freelancer request
exports.rejectFreelancerRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { rejectionReason } = req.body;
    const adminId = req.user.id;

    const request = await FreelancerRequest.findById(requestId).populate('customerId');
    if (!request) {
      throw new APIError('Freelancer request not found', StatusCodes.NOT_FOUND);
    }

    if (request.status !== 0) {
      throw new APIError('Request has already been processed', StatusCodes.BAD_REQUEST);
    }

    // Update request status
    request.status = 2; // rejected
    request.rejectionReason = rejectionReason;
    request.approvedBy = adminId;
    await request.save();

    res.status(StatusCodes.OK).json({
      success: true,
      message: `Freelancer request rejected. Reason sent to ${request.customerId.name}.`,
    });
  } catch (err) {
    console.error('Error in rejectFreelancerRequest:', err); // Debug log
    res.status(err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: err.message,
    });
  }
};

// Get all freelancer requests
exports.getAllFreelancerRequests = async (req, res) => {
  try {
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Filtering
    const filter = {};
    if (req.query.status !== undefined) {
      filter.status = Number(req.query.status); // Convert query param to number (0 = Pending, 1 = Approved, 2 = Rejected)
    }

    // Query the database
    const requests = await FreelancerRequest.find(filter)
      .populate('customerId', 'name email isFreelancer')
      .populate('approvedBy', '_id') // Optional: populate approvedBy if needed
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await FreelancerRequest.countDocuments(filter);

    res.status(StatusCodes.OK).json({
      success: true,
      count: requests.length,
      message: `${requests.length} freelancer requests found`,
      pagination: {
        totalRecords: total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        perPage: limit,
      },
      requests,
    });
  } catch (err) {
    console.error('Error in getAllFreelancerRequests:', err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: err.message,
    });
  }
};

// Get freelancer request status for customer
exports.getCustomerFreelancerStatus = async (req, res) => {
  try {
    const { customerId } = req.params;

    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new APIError('Customer not found', StatusCodes.NOT_FOUND);
    }

    // Check if already a freelancer
    if (customer.isFreelancer) {
      return res.status(StatusCodes.OK).json({
        success: true,
        message: 'Customer is already an approved freelancer',
        status: 1, // approved
        isFreelancer: true,
      });
    }

    // Check for pending/rejected requests
    const request = await FreelancerRequest.findOne({ customerId }).sort({ createdAt: -1 });

    if (!request) {
      return res.status(StatusCodes.OK).json({
        success: true,
        message: 'No freelancer request submitted yet',
        status: -1, // not_submitted
        isFreelancer: false,
      });
    }

    const response = {
      success: true,
      status: request.status,
      isFreelancer: false,
    };

    if (request.status === 2) {
      // rejected
      response.message = `Freelancer request was rejected. Reason: ${request.rejectionReason}`;
      response.rejectionReason = request.rejectionReason;
    } else if (request.status === 0) {
      // pending
      response.message = 'Freelancer request is pending admin approval';
    }

    res.status(StatusCodes.OK).json(response);
  } catch (err) {
    console.error('Error in getCustomerFreelancerStatus:', err); // Debug log
    res.status(err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: err.message,
    });
  }
};