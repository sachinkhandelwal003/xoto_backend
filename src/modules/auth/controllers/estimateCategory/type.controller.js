// controllers/type.controller.js
const mongoose = require('mongoose');
const {Category} = require('../../models/estimateCategory/category.model');
const {Subcategory} = require('../../models/estimateCategory/category.model');
const {Type} = require('../../models/estimateCategory/category.model');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const APIError = require('../../../../utils/errorHandler');
const asyncHandler = require('../../../../utils/asyncHandler');

// CREATE Type
exports.createType = asyncHandler(async (req, res) => {
  const { categoryId, subcategoryId } = req.params;
  const { label, description, order } = req.body;

  // Check if category exists
  const category = await Category.findById(categoryId);
  if (!category) throw new APIError('Category not found', StatusCodes.NOT_FOUND);

  // Check if subcategory exists and belongs to category
  const subcategory = await Subcategory.findOne({
    _id: subcategoryId,
    category: categoryId
  });
  if (!subcategory) throw new APIError('Subcategory not found', StatusCodes.NOT_FOUND);

  // Check if type already exists in this subcategory
  const exists = await Type.findOne({
    label,
    subcategory: subcategoryId,
    category: categoryId
  });
  if (exists) throw new APIError('Type already exists in this subcategory', StatusCodes.CONFLICT);

  const type = await Type.create({
    label,
    description: description || '',
    subcategory: subcategoryId,
    category: categoryId,
    order: order || 0
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Type created successfully',
    type,
  });
});

// GET Types with optional filters + pagination + params support
exports.getTypes = asyncHandler(async (req, res) => {
  const {
    label,
    active,
    populate = "false",
    page = 1,
    limit,  // optional for no pagination
  } = req.query;

  const { categoryId, subcategoryId } = req.params;

  let query = {};

  /* ------------------------------
      FILTERS FROM URL PARAMS
  ------------------------------ */
  if (categoryId) query.category = categoryId;
  if (subcategoryId) query.subcategory = subcategoryId;

  /* ------------------------------
      OPTIONAL QUERY FILTERS
  ------------------------------ */
  if (label) query.label = new RegExp(label, "i");
  if (active !== undefined) query.isActive = active === "true";

  /* ---------------------------------------------------------
      🟦 BASE QUERY
  --------------------------------------------------------- */
  let typeQuery = Type.find(query)
    .sort({ order: 1, createdAt: -1 });

  if (populate === "true") {
    typeQuery = typeQuery
      .populate({ path: "category", select: "name slug" })
      .populate({ path: "subcategory", select: "label description" });
  }

  /* ---------------------------------------------------------
      🟦 OPTIONAL PAGINATION
  --------------------------------------------------------- */
  let pagination = null;

  if (limit) {
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    typeQuery = typeQuery
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const total = await Type.countDocuments(query);

    pagination = {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    };
  }

  const types = await typeQuery;

  /* ---------------------------------------------------------
      🟦 RESPONSE
  --------------------------------------------------------- */
  res.status(StatusCodes.OK).json({
    success: true,
    data: types,
    pagination,   // null when no limit is passed
  });
});

// GET Single Type
exports.getTypeById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { populate = 'true' } = req.query;

  let type;

  if (populate === 'true') {
    type = await Type.findById(id)
      .populate({
        path: 'category',
        select: 'name slug'
      })
      .populate({
        path: 'subcategory',
        select: 'label description'
      });
  } else {
    type = await Type.findById(id);
  }

  if (!type) throw new APIError('Type not found', StatusCodes.NOT_FOUND);

  res.status(StatusCodes.OK).json({
    success: true,
    type,
  });
});

// UPDATE Type
exports.updateType = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { label, description, isActive, order } = req.body;

  const type = await Type.findById(id);
  if (!type) throw new APIError('Type not found', StatusCodes.NOT_FOUND);

  // Check if new label already exists in same subcategory
  if (label && label !== type.label) {
    const exists = await Type.findOne({
      label,
      subcategory: type.subcategory,
      _id: { $ne: id }
    });
    if (exists) throw new APIError('Type label already exists in this subcategory', StatusCodes.CONFLICT);
    type.label = label;
  }

  if (description !== undefined) type.description = description;
  if (isActive !== undefined) type.isActive = isActive;
  if (order !== undefined) type.order = order;

  await type.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Type updated successfully',
    type,
  });
});

// DELETE Type
exports.deleteType = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const type = await Type.findByIdAndUpdate(
    id,
    { isActive: false },
    { new: true }
  );

  if (!type) throw new APIError('Type not found', StatusCodes.NOT_FOUND);

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Type deactivated successfully',
    type,
  });
});