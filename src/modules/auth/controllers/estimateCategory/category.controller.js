const mongoose = require('mongoose');
const Category = require('../../models/estimateCategory/category.model');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const APIError = require('../../../../utils/errorHandler');
const asyncHandler = require('../../../../utils/asyncHandler');

// CREATE Category
exports.createCategory = asyncHandler(async (req, res) => {
  const { name, description } = req.body;

  const exists = await Category.findOne({
    $or: [{ name }, { slug: name.toLowerCase() }],
  });
  if (exists) throw new APIError('Category already exists', StatusCodes.CONFLICT);

  const category = await Category.create({ name, description });

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Category created successfully',
    category,
  });
});

// modules/category/controllers/category.controller.js

// BULK CREATE: Create Category + Subcategories + Types in ONE CALL
exports.bulkCreateCategories = asyncHandler(async (req, res) => {
  const { categories } = req.body;

  if (!Array.isArray(categories) || categories.length === 0) {
    throw new APIError('Provide "categories" as array', StatusCodes.BAD_REQUEST);
  }

  const result = [];
  const errors = [];

  for (let cat of categories) {
    const { name, description, subcategories = [] } = cat;

    // Check if category already exists
    const exists = await Category.findOne({
      $or: [{ name }, { slug: name?.toLowerCase().replace(/\s+/g, '-') }]
    });

    if (exists) {
      errors.push(`Category "${name}" already exists`);
      continue;
    }

    // Prepare subcategories with types
    const formattedSubcategories = subcategories.map(sub => ({
      label: sub.label,
      description: sub.description || '',
      isActive: sub.isActive ?? true,
      types: (sub.types || []).map(t => ({
        label: t.label,
        description: t.description || '',
        isActive: t.isActive ?? true,
      }))
    }));

    const newCategory = await Category.create({
      name,
      description: description || '',
      subcategories: formattedSubcategories,
    });

    result.push(newCategory);
  }

  if (errors.length > 0 && result.length === 0) {
    throw new APIError('Bulk create failed', StatusCodes.BAD_REQUEST, { errors });
  }

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Bulk categories created successfully',
    created: result.length,
    skipped: errors.length,
    categories: result,
    errors: errors.length > 0 ? errors : undefined,
  });
});
// CREATE Subcategory
exports.createSubcategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const { label, description } = req.body;

  const category = await Category.findById(categoryId);
  if (!category) throw new APIError('Category not found', StatusCodes.NOT_FOUND);

  const newSubcat = { label, description: description || '' };
  category.subcategories.push(newSubcat);
  await category.save();

  const created = category.subcategories[category.subcategories.length - 1];

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Subcategory created',
    subcategory: created,
  });
});

// CREATE Type (Sub-subcategory)
exports.createType = asyncHandler(async (req, res) => {
  const { categoryId, subcategoryId } = req.params;
  const { label, description } = req.body;

  const category = await Category.findById(categoryId);
  if (!category) throw new APIError('Category not found', StatusCodes.NOT_FOUND);

  const subcategory = category.subcategories.id(subcategoryId);
  if (!subcategory) throw new APIError('Subcategory not found', StatusCodes.NOT_FOUND);

  const newType = { label, description: description || '' };
  subcategory.types.push(newType);
  await category.save();

  const created = subcategory.types[subcategory.types.length - 1];

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Type created',
    type: created,
  });
});

// GET Categories - SUPER POWERFUL QUERY
exports.getCategories = asyncHandler(async (req, res) => {
  const {
    name,
    slug,
    active,
    subcategory,
    type,
    subcategoryId,
    typeId,
    fields,
  } = req.query;

  let query = {};

  if (name) query.name = new RegExp(name, 'i');
  if (slug) query.slug = slug.toLowerCase();
  if (active !== undefined) query.isActive = active === 'true';

  let pipeline = [{ $match: query }];

  if (subcategory) {
    pipeline.push({ $match: { 'subcategories.label': new RegExp(subcategory, 'i') } });
  }
  if (type) {
    pipeline.push({ $match: { 'subcategories.types.label': new RegExp(type, 'i') } });
  }
  if (subcategoryId) {
    pipeline.push({ $match: { 'subcategories._id': mongoose.Types.ObjectId(subcategoryId) } });
  }
  if (typeId) {
    pipeline.push({ $match: { 'subcategories.types._id': mongoose.Types.ObjectId(typeId) } });
  }

  if (active !== undefined) {
    const bool = active === 'true';
    pipeline.push({
      $addFields: {
        subcategories: {
          $filter: { input: '$subcategories', cond: { $eq: ['$$sub.isActive', bool] } },
        },
      },
    });
    pipeline.push({
      $addFields: {
        'subcategories.types': {
          $map: {
            input: '$subcategories',
            as: 'sub',
            in: {
              _id: '$$sub._id',
              label: '$$sub.label',
              description: '$$sub.description',
              isActive: '$$sub.isActive',
              types: {
                $filter: { input: '$$sub.types', cond: { $eq: ['$$type.isActive', bool] } },
              },
            },
          },
        },
      },
    });
  }

  if (fields) {
    const project = {};
    fields.split(',').forEach((f) => { project[f.trim()] = 1; });
    pipeline.push({ $project: project });
  }

  const categories = pipeline.length > 1
    ? await Category.aggregate(pipeline)
    : await Category.find(query).select(fields?.replace(/,/g, ' ')).lean();

  res.status(StatusCodes.OK).json({
    success: true,
    count: categories.length,
    categories,
  });
});

// GET Single Category by ID
exports.getCategoryById = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw new APIError('Category not found', StatusCodes.NOT_FOUND);

  res.status(StatusCodes.OK).json({ success: true, category });
});