const Estimate = require('../../models/leads/estimate.model');
const Quotation = require('../../models/leads/quotation.model');
const Customer = require('../../models/user/customer.model');
const Project = require('../../models/Freelancer/projectfreelancer.model');
const asyncHandler = require('../../../../utils/asyncHandler');
const { APIError } = require('../../../../utils/errorHandler');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const Freelancer = require("../../models/Freelancer/freelancer.model");
const mongoose = require('mongoose');
const { Role } = require('../../models/role/role.model');

exports.submitEstimate = asyncHandler(async (req, res) => {
  const {
    service_type,         // landscape / interior
    customer_name,
    customer_email,
    customer_mobile,
    type,                 // EstimateMasterType
    subcategory,          // EstimateMasterSubcategory
    package: pkg,
    area_length,
    area_width,
    area_sqft,
    description
  } = req.body;

  // ------------------------
  // VALIDATION
  // ------------------------
  if (!service_type || !['landscape', 'interior'].includes(service_type)) {
    throw new APIError("Valid service_type is required: 'landscape' or 'interior'", 400);
  }

  if (!customer_name || !customer_email || !customer_mobile?.number) {
    throw new APIError("Customer details are required", 400);
  }

  if (!type) throw new APIError("Type (EstimateMasterType) is required", 400);

  if (!area_sqft) throw new APIError("area_sqft is required", 400);

  // GET CUSTOMER ROLE
  const customerRole = await Role.findOne({ name: "Customer" });

  let customer = await Customer.findOne({
    email: customer_email.toLowerCase(),
    is_deleted: false
  });

  if (!customer) {
    customer = await Customer.create({
      name: customer_name,
      email: customer_email.toLowerCase(),
      mobile: customer_mobile.number,
      role: customerRole._id,
      isActive: true
    });
  }

  // ------------------------
  // CREATE ESTIMATE
  // ------------------------
  const estimate = await Estimate.create({
    service_type,
    customer_name,
    customer_email,
    customer_mobile,
    type,
    subcategory,
    package: pkg,
    area_length,
    area_width,
    area_sqft,
    description,
    customer: customer._id
  });

  await estimate.populate([
    { path: "type" },
    { path: "subcategory" },
    { path: "package" },
    { path: "customer", select: "name email mobile" }
  ]);

  return res.status(201).json({
    success: true,
    message: "Estimate submitted successfully",
    customer,
    estimate
  });
});


exports.getQuotations = asyncHandler(async (req, res) => {
  const { estimate_id } = req.query;

  if (!estimate_id) {
    throw new APIError("estimate_id is required", StatusCodes.BAD_REQUEST);
  }

  const estimate = await Estimate.findById(estimate_id);
  if (!estimate) {
    throw new APIError("Estimate not found", StatusCodes.NOT_FOUND);
  }

  const quotations = await Quotation.find({ estimate: estimate_id })
    .populate({
      path: "created_by",
      select: "name email mobile role"
    })
    .sort({ created_at: -1 });

  res.json({
    success: true,
    estimate_id,
    total: quotations.length,
    final_quotation: quotations.find(q => q.is_final) || null,
    data: quotations
  });
});


exports.getEstimates = asyncHandler(async (req, res) => {
  const {
    id,
    page = 1,
    limit,
    status,
    supervisor_progress,
    customer_progress,
    supervisor,
    customer_email,
    freelancer_id,
    customer_id
  } = req.query;

  /* ---------------------------------------------------------
      🟦 GET SINGLE ESTIMATE BY ID
  --------------------------------------------------------- */
  if (id) {
    const estimate = await Estimate.findById(id)
      .populate([
        { path: "type" },                             // EstimateMasterType
        { path: "subcategory" },                      // EstimateMasterSubcategory
        { path: "package" },                          // LandscapingPackage
        {
          path: "assigned_supervisor",
          select: "name email mobile role"
        },
        {
          path: "sent_to_freelancers",
          select: "name email mobile skills"
        },
        {
          path: "freelancer_quotations.freelancer",
          select: "name email mobile"
        },
        {
          path: "freelancer_quotations.quotation"
        },
        { path: "final_quotation" },
        {
          path: "customer",
          select: "name email mobile"
        }
      ]);

    if (!estimate) {
      throw new APIError("Estimate not found", StatusCodes.NOT_FOUND);
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      estimate
    });
  }

  /* ---------------------------------------------------------
      🟦 LIST FILTER LOGIC
  --------------------------------------------------------- */
  const query = {};

  if (status) query.status = status;
  if (supervisor_progress) query.supervisor_progress = supervisor_progress;
  if (customer_progress) query.customer_progress = customer_progress;
  if (supervisor) query.assigned_supervisor = supervisor;
  if (customer_email) query.customer_email = new RegExp(customer_email, "i");

  if (customer_id) {
    if (!mongoose.Types.ObjectId.isValid(customer_id))
      throw new APIError("Invalid customer ID", StatusCodes.BAD_REQUEST);

    query.customer = customer_id;
  }

  /* ---------------------------------------------------------
      🟦 FREELANCER-SPECIFIC FILTER
  --------------------------------------------------------- */
  if (freelancer_id) {
    if (!mongoose.Types.ObjectId.isValid(freelancer_id)) {
      throw new APIError("Invalid freelancer ID", StatusCodes.BAD_REQUEST);
    }

    query.$or = [
      { sent_to_freelancers: freelancer_id },
      { "freelancer_quotations.freelancer": freelancer_id }
    ];
  }

  /* ---------------------------------------------------------
      🟦 MAIN QUERY
  --------------------------------------------------------- */
  let estimatesQuery = Estimate.find(query)
    .populate([
      { path: "type" },
      { path: "subcategory" },
      { path: "package" },
      {
        path: "assigned_supervisor",
        select: "name email mobile role"
      },
      {
        path: "sent_to_freelancers",
        select: "name email mobile skills"
      },
      {
        path: "freelancer_quotations.freelancer",
        select: "name email mobile"
      },
      {
        path: "freelancer_quotations.quotation"
      },
      { path: "final_quotation" },
      {
        path: "customer",
        select: "name email mobile"
      }
    ])
    .sort({ createdAt: -1 });

  /* ---------------------------------------------------------
      🟦 PAGINATION
  --------------------------------------------------------- */
  let pagination = null;

  if (limit) {
    const limitNum = parseInt(limit);
    const pageNum = parseInt(page);

    estimatesQuery = estimatesQuery
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const total = await Estimate.countDocuments(query);

    pagination = {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum)
    };
  }

  const estimates = await estimatesQuery;

  res.status(StatusCodes.OK).json({
    success: true,
    data: estimates,
    pagination
  });
});



// ------------------------------------------------------------
// SUPERADMIN: ASSIGN TO SUPERVISOR
// ------------------------------------------------------------
exports.assignToSupervisor = asyncHandler(async (req, res) => {
  const { supervisor_id } = req.body;

  const estimate = await Estimate.findById(req.params.id);
  if (!estimate) throw new APIError('Estimate not found', StatusCodes.NOT_FOUND);

  estimate.assigned_supervisor = supervisor_id;
  estimate.assigned_by = req.user._id;
  estimate.assigned_at = new Date();
  estimate.status = 'assigned';
  estimate.supervisor_progress = 'none';

  await estimate.save();

  await estimate.populate('assigned_supervisor', 'name email');

  res.json({
    success: true,
    message: 'Assigned to supervisor',
    data: estimate
  });
});

// ------------------------------------------------------------
// SUPERVISOR: SEND REQUEST TO FREELANCERS
// ------------------------------------------------------------
exports.sendToFreelancers = asyncHandler(async (req, res) => {
  const estimate = await Estimate.findById(req.params.id);
  if (!estimate) throw new APIError('Estimate not found', StatusCodes.NOT_FOUND);

  const { freelancer_ids } = req.body;

  if (!Array.isArray(freelancer_ids) || freelancer_ids.length === 0) {
    throw new APIError("Please select at least one freelancer", StatusCodes.BAD_REQUEST);
  }

  const validFreelancers = await Freelancer.find({
    _id: { $in: freelancer_ids },
    isActive: true
  }).select('_id');

  if (!validFreelancers.length) {
    throw new APIError("No valid freelancers found", StatusCodes.BAD_REQUEST);
  }

  estimate.sent_to_freelancers = validFreelancers.map(f => f._id);

  // supervisor progress
  estimate.supervisor_progress = "request_sent";

  await estimate.save();

  res.json({
    success: true,
    message: "Request sent to selected freelancers",
    count: validFreelancers.length,
    freelancer_ids: validFreelancers.map(f => f._id)
  });
});

// ------------------------------------------------------------
// FREELANCER: SUBMIT QUOTATION
// ------------------------------------------------------------
// ------------------------------------------------------------
// FREELANCER: SUBMIT QUOTATION
// ------------------------------------------------------------// FREELANCER: SUBMIT QUOTATION
exports.submitQuotation = asyncHandler(async (req, res) => {
  const { items, scope_of_work, discount_percent = 0 } = req.body;

  if (!items?.length) throw new APIError("Items required", 400);
  if (!scope_of_work) throw new APIError("Scope of work required", 400);

  const estimate = await Estimate.findById(req.params.id);
  if (!estimate) throw new APIError('Estimate not found', 404);

  // Prevent duplicate
  const existing = await Quotation.findOne({
    estimate: req.params.id,
    created_by: req.user._id
  });
  if (existing) throw new APIError('Already submitted', 400);

  const quotation = await Quotation.create({
    estimate: req.params.id,
    created_by: req.user._id,
    created_by_model: "Freelancer",
    role: "freelancer",
    items,
    scope_of_work,
    discount_percent,
  });

  estimate.freelancer_quotations.push({
    freelancer: req.user._id,
    quotation: quotation._id,
    submitted_at: new Date()
  });

  // If all freelancers replied
  if (estimate.freelancer_quotations.length >= estimate.sent_to_freelancers.length) {
    estimate.supervisor_progress = "request_completed";
  }

  await estimate.save();

  res.json({
    success: true,
    message: 'Quotation submitted',
    data: quotation
  });
});

// ------------------------------------------------------------
// SUPERVISOR: CREATE FINAL QUOTATION
// SUPERADMIN: APPROVE FINAL QUOTATION
exports.approveFinalQuotation = asyncHandler(async (req, res) => {
  const estimate = await Estimate.findById(req.params.id)
    .populate('final_quotation');

  if (!estimate) throw new APIError('Estimate not found', StatusCodes.NOT_FOUND);
  if (!estimate.final_quotation) throw new APIError("No final quotation", StatusCodes.BAD_REQUEST);

  const quotation = estimate.final_quotation;

  quotation.superadmin_approved = true;
  quotation.superadmin_approved_at = new Date();
  await quotation.save();

  estimate.status = "superadmin_approved";
  estimate.customer_progress = "sent_to_customer";

  await estimate.save();

  res.json({
    success: true,
    message: "Final quotation approved & sent to customer",
    data: { estimate, final_quotation: quotation }
  });
});
// ------------------------------------------------------------// ------------------------------------------------------------
// SUPERVISOR: CREATE FINAL QUOTATION
// ------------------------------------------------------------// SUPERVISOR: CREATE FINAL QUOTATION
exports.createFinalQuotation = asyncHandler(async (req, res) => {
  const { items, scope_of_work, discount_percent = 0 } = req.body;

  if (!items || items.length === 0) {
    throw new APIError("Quotation items are required", StatusCodes.BAD_REQUEST);
  }

  const estimate = await Estimate.findById(req.params.id);
  if (!estimate) throw new APIError('Estimate not found', StatusCodes.NOT_FOUND);

  // Remove old final
  await Quotation.updateMany({ estimate: req.params.id }, { is_final: false });

  const quotation = await Quotation.create({
    estimate: req.params.id,
    created_by: req.user._id,
    created_by_model: "Allusers",
    role: "supervisor",
    items,
    scope_of_work,
    discount_percent,
    is_final: true
  });

  estimate.final_quotation = quotation._id;
  estimate.status = "final_created";
  estimate.supervisor_progress = "final_quotation_created";

  await estimate.save();

  res.json({
    success: true,
    message: "Final quotation created successfully",
    data: quotation
  });
});

// ------------------------------------------------------------
// SUPERADMIN: APPROVE FINAL QUOTATION
// ------------------------------------------------------------
// SUPERADMIN: APPROVE FINAL QUOTATION
// CUSTOMER: RESPOND TO FINAL QUOTATION
exports.customerResponse = asyncHandler(async (req, res) => {
  const { status, reason } = req.body; // status: "accepted" or "rejected"

  if (!["accepted", "rejected"].includes(status)) {
    throw new APIError("Status must be 'accepted' or 'rejected'", StatusCodes.BAD_REQUEST);
  }

  const estimate = await Estimate.findOne({
    _id: req.params.id,
    customer: req.user._id
  }).populate('final_quotation');

  if (!estimate) throw new APIError('Estimate not found', StatusCodes.NOT_FOUND);
  if (estimate.status !== "superadmin_approved") {
    throw new APIError("Cannot respond yet", StatusCodes.FORBIDDEN);
  }

  estimate.customer_response = {
    status,
    reason: reason || null,
    responded_at: new Date()
  };

  estimate.status = status === "accepted" ? "customer_accepted" : "customer_rejected";
  estimate.customer_progress = "customer_responded";

  await estimate.save();

  res.json({
    success: true,
    message: `Quotation ${status === "accepted" ? "Accepted" : "Rejected"}`,
    data: estimate
  });
});

// ------------------------------------------------------------
// CUSTOMER RESPONSE
// ------------------------------------------------------------
// exports.customerResponse = asyncHandler(async (req, res) => {
//   const { status, reason } = req.body;

//   const estimate = await Estimate.findById(req.params.id);
//   if (!estimate) throw new APIError('Estimate not found', StatusCodes.NOT_FOUND);

//   if (estimate.status !== "superadmin_approved") {
//     throw new APIError("Customer can respond only after superadmin approval");
//   }

//   estimate.customer_response = {
//     status,
//     reason,
//     responded_at: new Date()
//   };

//   estimate.status = (status === "accepted")
//     ? "customer_accepted"
//     : "customer_rejected";

//   estimate.customer_progress = "customer_responded";

//   await estimate.save();

//   res.json({
//     success: true,
//     message: `Customer ${status}`,
//     data: estimate
//   });
// });

// CUSTOMER: VIEW FINAL QUOTATION
// exports.getCustomerQuotation = asyncHandler(async (req, res) => {
//   const estimate = await Estimate.findOne({
//     _id: req.params.id,
//     customer: req.user._id
//   }).populate({
//     path: 'final_quotation',
//     populate: { path: 'created_by', select: 'name' }
//   });

//   if (!estimate) throw new APIError("Estimate not found", StatusCodes.NOT_FOUND);
//   if (!estimate.final_quotation) throw new APIError("No quotation yet", StatusCodes.BAD_REQUEST);
//   if (!estimate.final_quotation.superadmin_approved) {
//     throw new APIError("Not approved yet", StatusCodes.FORBIDDEN);
//   }

//   res.json({
//     success: true,
//     estimate_id: estimate._id,
//     status: estimate.status,
//     customer_response: estimate.customer_response,
//     quotation: estimate.final_quotation
//   });
// });
exports.getCustomerEstimates = asyncHandler(async (req, res) => {

 

  const estimates = await Estimate.find({ customer: req.user.id })
    .populate([
     
      { path: "final_quotation" }
    ])
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    count: estimates.length,
    data: estimates
  });
});
// ------------------------------------------------------------
// CUSTOMER: GET FINAL QUOTATION
// ------------------------------------------------------------
exports.getCustomerQuotation = asyncHandler(async (req, res) => {

  if (req.user.type !== "customer") {
    throw new APIError("Only customers can access this", StatusCodes.FORBIDDEN);
  }

  const estimate = await Estimate.findOne({
    _id: req.params.id,
    customer: req.user._id
  }).populate([
    { path: "final_quotation" },
    { path: "category", select: "name" }
  ]);

  if (!estimate) {
    throw new APIError("Estimate not found", StatusCodes.NOT_FOUND);
  }

  if (!estimate.final_quotation) {
    throw new APIError("No final quotation created yet", StatusCodes.BAD_REQUEST);
  }

  if (!estimate.final_quotation.superadmin_approved) {
    throw new APIError("Quotation not approved by superadmin yet", StatusCodes.FORBIDDEN);
  }

  res.json({
    success: true,
    estimate_id: estimate._id,
    category: estimate.category?.name || null,
    final_quotation: estimate.final_quotation
  });
});


// controllers/estimate/estimate.controller.js
exports.convertToDeal = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // ------------------------------
  // 1️⃣ Find Estimate (with NEW model populate paths)
  // ------------------------------
  const estimate = await Estimate.findById(id)
    .populate({ path: "final_quotation" })
    .populate({ path: "customer", select: "name email mobile" })
    .populate({ path: "subcategory" })   // EstimateMasterSubcategory
    .populate({ path: "type" })          // EstimateMasterType
    .populate({ path: "package" });      // LandscapingPackage

  if (!estimate) {
    throw new APIError("Estimate not found", StatusCodes.NOT_FOUND);
  }

  if (estimate.status !== "customer_accepted") {
    throw new APIError(
      "Only customer-accepted estimates can be converted to deal",
      StatusCodes.BAD_REQUEST
    );
  }

  if (estimate.project_reference) {
    throw new APIError(
      "Deal was already created for this estimate",
      StatusCodes.BAD_REQUEST
    );
  }

  const finalQuotation = estimate.final_quotation;

  // ------------------------------
  // 2️⃣ Create Project based on updated fields
  // ------------------------------
  const project = await Project.create({
    title:
      finalQuotation?.title ||
      finalQuotation?.scope_of_work?.substring(0, 100) ||
      estimate.description.substring(0, 100) ||
      "New Project",

    client_name: estimate.customer?.name || estimate.customer_name,
    client_company: estimate.client_company || "",
    address: estimate.address || "",
    city: estimate.city || "",
    gps_coordinates: estimate.gps_coordinates || {},

    start_date: new Date(),
    end_date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),

    budget: finalQuotation?.grand_total || 0,
    overview: estimate.description,
    scope_details: finalQuotation?.scope_of_work || estimate.description,

    // 🔥 NEW MODEL MAPPING
    subcategory: estimate.type?._id,                  // EstimateMasterType
    category: estimate.subcategory?._id,    // EstimateMasterSubcategory
    // Relationships


    customer: estimate.customer,
    estimate_reference: estimate._id,

    freelancer: null,
    accountant: null,
    milestones: [],
    status: "pending"
  });

  // ------------------------------
  // 3️⃣ Mark Estimate as Deal Created
  // ------------------------------
  estimate.status = "deal";
  estimate.customer_progress = "deal_created";
  estimate.project_reference = project._id;
  estimate.deal_converted_at = new Date();
  estimate.deal_converted_by = req.user._id;

  await estimate.save();

  // ------------------------------
  // 4️⃣ Response
  // ------------------------------
  res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Deal created successfully! Project is pending freelancer assignment.",
    data: {
      project_id: project._id,
      title: project.title,
      status: project.status,
      budget: project.budget,
      service_type: estimate.service_type,
      client: project.client_name,
      type: estimate.type?.label,
      subcategory: estimate.subcategory?.label,
      package: estimate.package?.name,
      scope_of_work: project.scope_details,
      milestones: 0,
      freelancer_assigned: false
    }
  });
});

