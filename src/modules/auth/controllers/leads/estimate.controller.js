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
const { TypeGallery } = require("../../models/estimateCategory/typeGallery.model");
const { Type } = require("../../models/estimateCategory/category.model");
const EstimateAnswer = require("../../models/estimateCategory/estimateAnswer.model");


exports.submitEstimate = asyncHandler(async (req, res) => {
  const {
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
    location,
    type_gallery_snapshot,
    answers
  } = req.body;

  /* ---------- CUSTOMER ---------- */
  const customerRole = await Role.findOne({ name: "Customer" });

  let customer = await Customer.findOne({
    email: customer_email.toLowerCase(),
    is_deleted: false
  });

  if (!customer) {
    customer = await Customer.create({
      name: customer_name,
      email: customer_email.toLowerCase(),
      mobile: {
        country_code: customer_mobile.country_code || "+91",
        number: customer_mobile.number
      },
      role: customerRole._id,
      location
    });
  } else if (customer && location) {
    customer.location = location;
    await customer.save();
  }

  /* ---------- FETCH TYPE GALLERY ---------- */
  // const typeGallery = await TypeGallery.findOne({
  //   type,
  //   isActive: true
  // }).lean();

  // if (!typeGallery) {
  //   throw new APIError("Type gallery not found", 400);
  // }

  /* ---------- FILTER MOODBOARD IMAGES ---------- */
  let selectedMoodboards = [];

  // if (
  //   type_gallery_snapshot?.moodboardImages &&
  //   Array.isArray(type_gallery_snapshot.moodboardImages)
  // ) {
  //   const requestedIds = type_gallery_snapshot.moodboardImages.map(img => img.id);

  //   selectedMoodboards = typeGallery.moodboardImages.filter(img =>
  //     requestedIds.includes(img.id)
  //   );
  // }




  /* ---------- CREATE ESTIMATE ---------- */
  const estimate = await Estimate.create({
    service_type,
    type,
    subcategory,
    package: null,
    area_length,
    area_width,
    area_sqft,
    description,

    customer: customer._id,

    // ✅ FINAL SNAPSHOT
    type_gallery_snapshot: {}
  });

  let childType = await Type.findOne({ _id: type });

  // calculation block 
  // in yesorno type if user selects no then  we will not add any value
  // currently we'll have only one number type of question 
  // options and yes or no are mostly same  

  let estimationValue = 0;
  let totalsqm = 0;

  if (answers.length > 0) {
    const areaAnswer = answers.find(a => a?.areaQuestion === true);

    if (areaAnswer) {
      totalsqm = Number(areaAnswer.answerValue) || 0;
      console.log("childType.baseEstimationValueUnitchildType.baseEstimationValueUnit", childType.baseEstimationValueUnit)
      console.log("Total sqmmmmmmmmmmmmmmmmmmmmmmmm", totalsqm)
      const baseAmount =
        Number(childType.baseEstimationValueUnit || 0) * totalsqm;

      estimationValue += baseAmount;
      areaAnswer.calculatedAmount = baseAmount;
    }
  }


  // if (answers.length > 0) {
  //   for (let answer of answers) {


  //     if (answer && answer.areaQuestion == false && answer.questionType == "yesorno") {
  //       if (answer.selectedOption && answer.selectedOption.title == "Yes") {
  //         if (answer.selectedOption.valueSubType == "persqm") {
  //           estimationValue += Number(answer.selectedOption.value) * Number(totalsqm);
  //           answer.calculatedAmount = Number(answer.selectedOption.value) * Number(totalsqm);
  //         } else { // for flat
  //           estimationValue += Number(answer.selectedOption.value);
  //           answer.calculatedAmount = Number(answer.selectedOption.value)
  //         }
  //       }
  //     } else if (answer && answer.areaQuestion == false && answer.questionType == "options") { // same as yes or no 
  //       if (answer.selectedOption.valueSubType == "persqm") {
  //         answer.calculatedAmount = Number(answer.selectedOption.value) * Number(totalsqm)
  //         estimationValue += Number(answer.selectedOption.value) * Number(totalsqm);
  //       } else { // for flat
  //         answer.calculatedAmount = Number(answer.selectedOption.value)
  //         estimationValue += Number(answer.selectedOption.value)
  //       }
  //     }
  //   }
  // }

  for (let answer of answers) {
    if (!answer || !answer.includeInEstimate || answer.areaQuestion) continue;

    let calculatedAmount = 0;

    // YES / NO
    if (answer.questionType === "yesorno") {
      if (answer.selectedOption?.title === "Yes") {
        if (answer.selectedOption.valueSubType === "persqft") {
          calculatedAmount =
            Number(answer.selectedOption.value || 0) * totalsqm;
        } else {
          calculatedAmount = Number(answer.selectedOption.value || 0);
        }
      }
    }

    // OPTIONS
    if (answer.questionType === "options") {
      if (answer.selectedOption?.valueSubType === "persqft") {
        calculatedAmount =
          Number(answer.selectedOption.value || 0) * totalsqm;
      } else {
        calculatedAmount = Number(answer.selectedOption.value || 0);
      }
    }

    answer.calculatedAmount = calculatedAmount;
    estimationValue += calculatedAmount;
  }


  // console.log("Estimatiiiiiiiiiiiooooooooooonnnnnnnnnnnn value", estimationValue)


  const estimateAnswerDocs = answers.map(answer => ({
    estimate: estimate._id,

    question: answer.question, // ObjectId from frontend
    questionText: answer.questionText,
    questionType: answer.questionType,

    answerValue: answer.answerValue ?? null,

    selectedOption: answer.selectedOption
      ? {
        optionId: answer.selectedOption.optionId,
        title: answer.selectedOption.title,
        value: answer.selectedOption.value,
        valueSubType: answer.selectedOption.valueSubType
      }
      : null,

    calculatedAmount: answer.calculatedAmount || 0,
    includeInEstimate: answer.includeInEstimate ?? true,
    areaQuestion: answer.areaQuestion ?? false
  }));


  let estimateAnswers = answers.map(answer => ({
    estimate: estimate._id,

    question: answer.question, // ObjectId from frontend
    questionText: answer.questionText,
    questionType: answer.questionType,

    answerValue: answer.answerValue ?? null,

    selectedOption: answer.selectedOption
      ? {
        optionId: answer.selectedOption.optionId,
        title: answer.selectedOption.title,
        value: answer.selectedOption.value,
        valueSubType: answer.selectedOption.valueSubType
      }
      : null,

    calculatedAmount: answer.calculatedAmount || 0,
    includeInEstimate: answer.includeInEstimate ?? true,
    areaQuestion: answer.areaQuestion ?? false
  }));

  await EstimateAnswer.insertMany(estimateAnswerDocs);


  let updatedEstimate = await Estimate.findByIdAndUpdate(estimate._id, {
    estimated_amount: estimationValue,
    area_sqft: totalsqm
  }, { new: true })


  res.status(201).json({
    success: true,
    message: "Estimate submitted successfully",
    estimate_id: estimate._id,
    final_price: Number(updatedEstimate.estimated_amount) || 0,
    updatedEstimate: updatedEstimate
  });
});



exports.getQuotations = asyncHandler(async (req, res) => {
  let { freelancer_id } = req.query;
  let page = Number(req.query.page) || 1;
  let limit = Number(req.query.limit) || 10;

  let skip = (page - 1) * limit;
  // if (!estimate_id) {
  //   throw new APIError("estimate_id is required", StatusCodes.BAD_REQUEST);
  // }

  let query = { created_by: freelancer_id, created_by_model: "Freelancer" }

  let is_selected_by_supervisor = req.query.is_selected_by_supervisor;

  if (is_selected_by_supervisor) {
    query.is_selected_by_supervisor = is_selected_by_supervisor == "true"
  }

  const quotations = await Quotation.find(query)
    .populate([{
      path: "created_by",
      select: "name email mobile role"
    }, { path: "estimate" }, {
      path: "estimate_type"
    }, {
      path: "estimate_subcategory"
    }]).skip(skip).limit(limit)
    .sort({ created_at: -1 });
  let total = await Quotation.countDocuments({ created_by: freelancer_id, created_by_model: "Freelancer" })

  const final_quotation = await Quotation.findOne({
    created_by: freelancer_id, created_by_model: "Freelancer", is_final: true
  })

  res.json({
    success: true,
    freelancer_id: freelancer_id ? freelancer_id : null,
    total: quotations.length,
    final_quotation: final_quotation,
    data: quotations,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit)
    }
  });
});


exports.getQuotationsByEstimateId = asyncHandler(async (req, res) => {
  let { estimate_id } = req.query;
  let page = Number(req.query.page) || 1;
  let limit = Number(req.query.limit) || 10;
  let is_final = req.query.is_final

  let skip = (page - 1) * limit;
  // if (!estimate_id) {
  //   throw new APIError("estimate_id is required", StatusCodes.BAD_REQUEST);
  // }

  let query = { estimate: estimate_id, created_by_model: "Freelancer" }

  const quotations = await Quotation.find(query)
    .populate([{
      path: "created_by",
      select: "name email mobile role"
    }, { path: "estimate" }, {
      path: "estimate_type"
    }, {
      path: "estimate_subcategory"
    }]).skip(skip).limit(limit)
    .sort({ created_at: -1 });
  let total = await Quotation.countDocuments({ estimate: estimate_id, created_by_model: "Freelancer" })

  const final_quotation = await Quotation.findOne({
    estimate: estimate_id, created_by_model: "Freelancer", is_final: true
  })

  res.json({
    success: true,
    estimate: estimate_id,
    total: quotations.length,
    final_quotation: final_quotation,
    data: quotations,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit)
    }
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
        { path: "type" },
        { path: "admin_final_quotation" },                    // EstimateMasterType
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
          path: "customer"
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

  if (status) {
    if (status == "supervisor_submitted") {
      query.status = { $in: ["superadmin_approved", "customer_accepted", "customer_rejected", "cancelled", "deal"] }
    } else {
      query.status = status;
    }
  } // asigned
  if (supervisor_progress) query.supervisor_progress = supervisor_progress; // request_completed
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
      { path: "admin_final_quotation" },
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
        path: "freelancer_quotations.quotation",
        populate: [
          { path: "estimate_type" },
          { path: "estimate_subcategory" },
          { path: "created_by", select: "name email mobile" }
        ]
      },
      { path: "final_quotation" },
      {
        path: "customer"
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

  let estimates = await estimatesQuery;

  estimates = await Promise.all(estimates.map(async (e) => {
    let EstimateAnswers = await EstimateAnswer.find({ estimate: e._id }).populate("selectedOption question");
    return { ...e.toObject(), EstimateAnswers }
  }))

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

exports.approvedBySuperAdmin = asyncHandler(async (req, res) => {
  let { estimate_id, final_quotation_id } = req.query;

  // update the final quotation of  supervisor and in customer side we will show this as the final quotation
  // if customer approves it the we'll create a project on superVisor side 
  // and there he will do the creating milestone work
  // otherwise if the customer deny then notify supervisor and admin that the customer has rejected your 



  const estimate = await Estimate.findById(req.params.id);
  if (!estimate) throw new APIError('Estimate not found', StatusCodes.NOT_FOUND);

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
  const { scope_of_work, discount_percent = 0, price, estimate_type, estimate_subcategory } = req.body;

  // if (!items?.length) throw new APIError("Items required", 400);
  if (!scope_of_work) throw new APIError("Scope of work required", 400);

  const estimate = await Estimate.findById(req.params.id);
  if (!estimate) throw new APIError('Estimate not found', 404);

  // Prevent duplicate
  const existing = await Quotation.findOne({
    estimate: req.params.id,
    created_by: req.user._id
  });
  // if (existing) throw new APIError('Already submitted', 400);

  const priceNum = Number(price);
  const discountPercentNum = Number(discount_percent);

  if (priceNum < 0) {
    return res.status(400).json({
      success: false,
      message: 'Price cannot be less than 0',
      data: null
    })
  };
  if (discountPercentNum < 0 || discountPercentNum > 100) {
    return res.status(400).json({
      success: false,
      message: 'Discount percentage can be between 0 and 100',
      data: null
    })
  };

  const discountAmount = Number(((priceNum * discountPercentNum) / 100).toFixed(2));
  const grand_total = Number(Math.max(0, priceNum - discountAmount).toFixed(2));
  console.log("grenadeeeeeeeeeeeeeeeeeeeeeeeeeee", grand_total)
  const quotation = await Quotation.create({
    estimate: req.params.id,
    created_by: req.user._id,
    created_by_model: "Freelancer",
    role: "freelancer",
    grand_total: grand_total,
    scope_of_work,
    discount_percent,
    price,
    estimate_type,
    estimate_subcategory
  });

  estimate.freelancer_quotations.push({
    freelancer: req.user._id,
    quotation: quotation._id,
    submitted_at: new Date()
  });

  // If all freelancers replied
  // if (estimate.freelancer_quotations.length >= estimate.sent_to_freelancers.length) {
  estimate.supervisor_progress = "request_completed";
  // }

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
  let {
    scope_of_work,
    price,
    estimate_type,
    estimate_subcategory,
    margin_type,
    margin_percent = 0,
    margin_amount = 0
  } = req.body;


  if (!price || Number(price) <= 0) {
    throw new APIError("Valid price is required", 400);
  }

  const estimate = await Estimate.findById(req.query.id);
  if (!estimate) throw new APIError("Estimate not found", 404);

  let new_price = Number(price);
  let final_margin_amount = 0;

  if (margin_type === "percentage") {
    console.log("code came in this bliock")
    if (margin_percent < 0 || margin_percent > 100) {
      throw new APIError("Margin percentage must be between 0 and 100", 400);
    }

    final_margin_amount = (new_price * margin_percent) / 100;
    console.log("final_margin_amountfinal_margin_amount", new_price, margin_percent)
    new_price += final_margin_amount;

  } else if (margin_type === "amount") {
    if (margin_amount < 0) {
      throw new APIError("Margin amount cannot be negative", 400);
    }

    final_margin_amount = Number(margin_amount);
    new_price += final_margin_amount;
  }

  const admin_final_quotation = await Quotation.create({
    estimate: estimate._id,
    created_by: req.user._id,
    created_by_model: "User",
    role: "admin",
    grand_total: new_price,
    scope_of_work,
    price: new_price,
    estimate_type,
    estimate_subcategory,
    margin_type,
    margin_percent,
    margin_amount: final_margin_amount,
    superadmin_approved: true,
    superadmin_approved_at: new Date()
  });

  estimate.admin_final_quotation = admin_final_quotation._id;
  estimate.status = "superadmin_approved";
  estimate.customer_progress = "sent_to_customer";

  await estimate.save();

  res.json({
    success: true,
    message: "Final quotation approved & sent to customer",
    data: {
      estimate,
      final_quotation: admin_final_quotation
    }
  });
});

// ------------------------------------------------------------// ------------------------------------------------------------
// SUPERVISOR: CREATE FINAL QUOTATION
// ------------------------------------------------------------// SUPERVISOR: CREATE FINAL QUOTATION
exports.createFinalQuotation = asyncHandler(async (req, res) => {
  const { scope_of_work, discount_percent = 0, price, estimate_type, estimate_subcategory, freelancer_quotation_id } = req.body;
  if (!freelancer_quotation_id) {
    throw new APIError("Freelancer quotation ID is required", 400);
  }
  // if (!items || items.length === 0) {
  //   throw new APIError("Quotation items are required", StatusCodes.BAD_REQUEST);
  // }

  const estimate = await Estimate.findById(req.params.id);
  if (!estimate) throw new APIError('Estimate not found', StatusCodes.NOT_FOUND);

  // Remove old final
  await Quotation.updateMany({ estimate: req.params.id }, { is_final: false });
  let freelancer_quotation = await Quotation.findOneAndUpdate({ estimate: req.params.id, _id: freelancer_quotation_id }, { is_selected_by_supervisor: true },
    { new: true });


  if (!freelancer_quotation) {
    throw new APIError("Selected freelancer quotation not found", 404);
  }

  const priceNum = Number(price);
  const discountPercentNum = Number(discount_percent);

  if (priceNum < 0) throw new APIError("Price must be >= 0", 400);
  if (discountPercentNum < 0 || discountPercentNum > 100) {
    throw new APIError("Discount must be between 0 and 100", 400);
  }

  const discountAmount = Number(((priceNum * discountPercentNum) / 100).toFixed(2));
  const grand_total = Number(Math.max(0, priceNum - discountAmount).toFixed(2));

  // margin_percent , margin_amount , status:"supervisor_to_admin"
  let margin_amount = req.body.margin_amount || null;
  margin_amount = Number(margin_amount);
  let margin_percent = Number(req.body.margin_percent) || 0;


  let margin_type = req.body.margin_type || "percentage";
  if (margin_type == "percentage") {

    if (margin_percent < 0 || margin_percent > 100) {
      throw new APIError("Margin percent must be between 0 and 100", 400);
    }

    let newAmount = (Number(price) * Number(margin_percent)) / 100;
    margin_amount = newAmount;
  }

  let newPrice = Number(price)
  if (margin_amount > 0) {
    newPrice += margin_amount
  }


  const quotation = await Quotation.create({
    estimate: req.params.id,
    created_by: req.user._id,
    created_by_model: "Allusers",
    margin_percent: margin_percent,
    margin_amount: margin_amount,
    status: "supervisor_to_admin",
    role: "supervisor",
    margin_type: margin_type,
    scope_of_work,
    discount_percent,
    is_final: true,
    price: newPrice, estimate_type, estimate_subcategory, grand_total: newPrice, discount_amount: discountAmount
  });

  estimate.freelancer_selected_quotation = freelancer_quotation._id

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
  const {
    id,
    page = 1,
    limit,
    status,
    customer_progress
  } = req.query;

  /* ---------------------------------------------------------
      🟦 GET SINGLE ESTIMATE (CUSTOMER-OWNED)
  --------------------------------------------------------- */
  if (id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new APIError("Invalid estimate ID", StatusCodes.BAD_REQUEST);
    }

    const estimate = await Estimate.findOne({
      _id: id,
      customer: req.user.id
    }).populate([
      {
        path: "customer"
      },
      { path: "type" },
      { path: "subcategory" },
      { path: "package" },
      { path: "final_quotation" },

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
      🟦 LIST FILTER LOGIC (CUSTOMER ONLY)
  --------------------------------------------------------- */
  const query = {
    customer: req.user.id
  };

  if (status) query.status = status;
  if (customer_progress) {
    if (customer_progress == "customer_responded") {
      query.$or = [
        { customer_progress: "customer_responded" },
        { customer_progress: "deal_created" }
      ]
      // customer_responded,deal_created
    } else {
      query.customer_progress = customer_progress;
    }
  }

  /* ---------------------------------------------------------
      🟦 MAIN QUERY
  --------------------------------------------------------- */
  let estimatesQuery = Estimate.find(query)
    .populate([
      {
        path: "customer"
      },
      { path: "type" },
      { path: "subcategory" },
      { path: "package" },
      { path: "final_quotation" },
      {
        path: "admin_final_quotation", populate: [{
          path: "estimate_type",
          model: "EstimateMasterType" // use your actual model name
        }, {
          path: "estimate_subcategory",
          model: "EstimateMasterSubcategory" // use your actual model name
        }]
      }
    ])
    .sort({ createdAt: -1 });

  /* ---------------------------------------------------------
      🟦 PAGINATION (OPTIONAL)
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
    count: estimates.length,
    data: estimates,
    pagination
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
// controllers/estimate/estimate.controller.js
exports.convertToDeal = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // 1️⃣ Fetch estimate with all required relations
  const estimate = await Estimate.findById(id)
    .populate("final_quotation")
    .populate("freelancer_selected_quotation")
    .populate("customer", "name email mobile")
    .populate("subcategory")   // EstimateMasterSubcategory
    .populate("type")          // EstimateMasterType
    .populate("package");

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
      "Project already created for this estimate",
      StatusCodes.BAD_REQUEST
    );
  }

  const finalQuotation = estimate.final_quotation;

  // 2️⃣ Normalize client name
  let clientName = estimate.customer_name;
  if (estimate.customer?.name) {
    clientName =
      typeof estimate.customer.name === "string"
        ? estimate.customer.name
        : `${estimate.customer.name.first_name || ""} ${estimate.customer.name.last_name || ""}`.trim();
  }

  // 3️⃣ Create Project
  const project = await Project.create({
    title:
      finalQuotation?.title ||
      finalQuotation?.scope_of_work?.substring(0, 100) ||
      estimate.description?.substring(0, 100) ||
      "New Project",

    client_name: clientName,
    client_company: "",
    address: "",
    city: "",

    assigned_supervisor: estimate.assigned_supervisor,
    assigned_freelancer: estimate.freelancer_selected_quotation.created_by,

    start_date: new Date(),
    end_date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // +6 months

    budget: finalQuotation?.grand_total || 0,
    overview: estimate.description,
    scope_details: finalQuotation?.scope_of_work || estimate.description,

    // ✅ CORRECT MAPPING
    category: estimate.subcategory?._id,          // Category_freelancer
    subcategory: estimate.type?._id ? [estimate.type._id] : [],

    customer: estimate.customer?._id,
    estimate_reference: estimate._id,

    freelancers: [],
    accountant: null,
    milestones: [],
    status: "pending"
  });

  // 4️⃣ Update Estimate status
  estimate.status = "deal";
  estimate.customer_progress = "deal_created";
  estimate.project_reference = project._id;
  estimate.deal_converted_at = new Date();
  estimate.deal_converted_by = req.user._id;

  await estimate.save();

  // 5️⃣ Response
  res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Deal converted successfully. Project created.",
    data: {
      project_id: project._id,
      project_code: project.Code,
      title: project.title,
      status: project.status,
      budget: project.budget,
      service_type: estimate.service_type,
      client: project.client_name,
      category: estimate.subcategory?.label,
      subcategory: estimate.type?.label,
      package: estimate.package?.name || null,
      scope_of_work: project.scope_details,
      milestones: project.milestones.length,
      freelancer_assigned: false
    }
  });
});


