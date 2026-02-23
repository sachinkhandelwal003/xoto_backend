// controllers/category.controller.js
const mongoose = require('mongoose');
const {Category} = require('../../models/estimateCategory/category.model');
const {Subcategory} = require('../../models/estimateCategory/category.model');
const {Type} = require('../../models/estimateCategory/category.model');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const APIError = require('../../../../utils/errorHandler');
const logActivity = require('../../../../utils/logActivity');

const asyncHandler = require('../../../../utils/asyncHandler');

// CREATE Category
exports.createCategory = asyncHandler(async (req, res) => {
  const { name, description } = req.body;

  const exists = await Category.findOne({
    $or: [{ name }, { slug: name.toLowerCase() }],
  });
  if (exists) throw new APIError('Category already exists', StatusCodes.CONFLICT);

  const category = await Category.create({ name, description });

  // 🔥 ACTIVITY LOG
  await logActivity({
    entity_type: 'Category',
    entity_id: category._id,
    module_id: '69317b5730e70111a929fe11',       // Estimate master
    sub_module_id: '69317b7b30e70111a929fe4c',   // Category
    performed_by: req.user._id,
    role_id: req.user.role,
    role_slug: req.user.role_slug || 'admin',
    action_type: 'created',
    description: `Category "${category.name}" created`,
    new_value: {
      name: category.name,
      description: category.description,
      isActive: true
    },
    req
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Category created successfully',
    category,
  });
});


// BULK CREATE with relationships
exports.bulkCreateCategories = asyncHandler(async (req, res) => {
  const { categories } = req.body;

  if (!Array.isArray(categories) || categories.length === 0) {
    throw new APIError('Provide "categories" as array', StatusCodes.BAD_REQUEST);
  }

  const result = [];
  const errors = [];

  for (let cat of categories) {
    const { name, description, subcategories = [] } = cat;

    // Check if category exists
    let category = await Category.findOne({
      $or: [{ name }, { slug: name?.toLowerCase().replace(/\s+/g, '-') }]
    });

    if (!category) {
      // Create category
      category = await Category.create({
        name,
        description: description || '',
      });
    }

    const categoryData = {
      _id: category._id,
      name: category.name,
      slug: category.slug,
      subcategories: []
    };

    // Create subcategories
    for (let sub of subcategories) {
      const { label, description: subDesc, types = [] } = sub;

      // Check if subcategory exists
      let subcategory = await Subcategory.findOne({
        label,
        category: category._id
      });

      if (!subcategory) {
        // Create subcategory
        subcategory = await Subcategory.create({
          label,
          description: subDesc || '',
          category: category._id,
          order: sub.order || 0
        });
      }

      const subcategoryData = {
        _id: subcategory._id,
        label: subcategory.label,
        description: subcategory.description,
        types: []
      };

      // Create types
      for (let type of types) {
        const { label: typeLabel, description: typeDesc } = type;

        // Check if type exists
        let existingType = await Type.findOne({
          label: typeLabel,
          subcategory: subcategory._id,
          category: category._id
        });

        if (!existingType) {
          existingType = await Type.create({
            label: typeLabel,
            description: typeDesc || '',
            subcategory: subcategory._id,
            category: category._id,
            order: type.order || 0
          });
        }

        subcategoryData.types.push({
          _id: existingType._id,
          label: existingType.label,
          description: existingType.description
        });
      }

      categoryData.subcategories.push(subcategoryData);
    }

    result.push(categoryData);
  }

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Bulk categories created successfully',
    created: result.length,
    categories: result,
    errors: errors.length > 0 ? errors : undefined,
  });
});

// GET Categories with populated relationships
// GET Categories with optional filters + optional pagination
exports.getCategories = asyncHandler(async (req, res) => {
  const {
    name,
    slug,
    active,
    page = 1,
    limit, // optional
  } = req.query;

  let query = {};

  if (name) query.name = new RegExp(name, "i");
  if (slug) query.slug = slug.toLowerCase();
  if (active !== undefined) query.isActive = active === "true";

  /* ---------------------------------------------------------
      🟦 BASE QUERY
  --------------------------------------------------------- */
  let categoryQuery = Category.find(query)
    .sort({ createdAt: -1 });

  /* ---------------------------------------------------------
      🟦 OPTIONAL PAGINATION
  --------------------------------------------------------- */
  let pagination = null;

  if (limit) {
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    categoryQuery = categoryQuery
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const total = await Category.countDocuments(query);

    pagination = {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    };
  }

  const categories = await categoryQuery;

  /* ---------------------------------------------------------
      🟦 RESPONSE
  --------------------------------------------------------- */
  res.status(StatusCodes.OK).json({
    success: true,
    data: categories,
    pagination, // null when no limit is passed
  });
});


// GET Single Category with all relationships
exports.getCategoryById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { populate = 'true' } = req.query;

  let category;

  if (populate === 'true') {
    category = await Category.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(id) } },
      {
        $lookup: {
          from: 'subcategories',
          localField: '_id',
          foreignField: 'category',
          pipeline: [
            {
              $lookup: {
                from: 'types',
                localField: '_id',
                foreignField: 'subcategory',
                as: 'types'
              }
            },
            { $sort: { order: 1 } }
          ],
          as: 'subcategories'
        }
      }
    ]);

    category = category[0];
  } else {
    category = await Category.findById(id);
  }

  if (!category) throw new APIError('Category not found', StatusCodes.NOT_FOUND);

  res.status(StatusCodes.OK).json({
    success: true,
    category,
  });
});

// UPDATE Category
exports.updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, isActive } = req.body;

  const category = await Category.findById(id);
  if (!category) throw new APIError('Category not found', StatusCodes.NOT_FOUND);

  if (name && name !== category.name) {
    const exists = await Category.findOne({ name });
    if (exists) throw new APIError('Category name already exists', StatusCodes.CONFLICT);
    category.name = name;
  }

  if (description !== undefined) category.description = description;
  if (isActive !== undefined) category.isActive = isActive;

  await category.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Category updated successfully',
    category,
  });
});

// DELETE Category (Soft delete)
exports.deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check if category has subcategories
  const hasSubcategories = await Subcategory.exists({ category: id, isActive: true });
  if (hasSubcategories) {
    throw new APIError('Cannot delete category with active subcategories', StatusCodes.BAD_REQUEST);
  }

  const category = await Category.findByIdAndUpdate(
    id,
    { isActive: false },
    { new: true }
  );

  if (!category) throw new APIError('Category not found', StatusCodes.NOT_FOUND);

  // Also deactivate related types
  await Type.updateMany(
    { category: id },
    { isActive: false }
  );

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Category deactivated successfully',
    category,
  });
});