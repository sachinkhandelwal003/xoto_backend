const Category = require('../../models/category.model');
const { StatusCodes } = require('../../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../../utils/errorHandler');
const asyncHandler = require('../../../../../utils/asyncHandler');


exports.createCategory = asyncHandler(async (req, res, next) => {
  // 1️⃣ Build categoryData object from FormData
  const categoryData = {
    name: req.body.name?.trim(),
    metaTitle: req.body.metaTitle?.trim() || '',
    metaDescription: req.body.metaDescription?.trim() || '',
    icon: req.body.icon?.trim() || '',
    status: req.body.status ? parseInt(req.body.status) : 1
  };

  // Boolean fields (FormData sends strings 'true'/'false')
  categoryData.isHighlighted = req.body.isHighlighted === 'true';
  categoryData.isSpecial = req.body.isSpecial === 'true';
  categoryData.showInFilterMenu = req.body.showInFilterMenu === 'true';

  // Parent category
  categoryData.parent = req.body.parent || null;

  // 2️⃣ Parse metaKeywords robustly
  let keywords = [];
  if (req.body.metaKeywords) {
    try {
      const parsed = typeof req.body.metaKeywords === 'string'
        ? JSON.parse(req.body.metaKeywords)
        : req.body.metaKeywords;

      if (Array.isArray(parsed)) {
        keywords = parsed
          .filter(k => k && k.trim().length > 0)
          .map(k => k.trim());
      }
    } catch (err) {
      if (Array.isArray(req.body.metaKeywords)) {
        keywords = req.body.metaKeywords
          .filter(k => k && k.trim().length > 0)
          .map(k => k.trim());
      }
    }
  }
  categoryData.metaKeywords = keywords;

  // 3️⃣ Auto-generate slug
  if (categoryData.name) {
    categoryData.slug = categoryData.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // 4️⃣ Handle image
  if (req.file) {
    categoryData.image = req.file.path; // or req.file.filename depending on your storage
  }

  // 5️⃣ Validate required fields
  if (!categoryData.name) {
    throw new APIError('Category name is required', StatusCodes.BAD_REQUEST);
  }

  // 6️⃣ Check for duplicates (name or slug)
  const existingCategory = await Category.findOne({
    $or: [
      { name: categoryData.name, status: 1 },
      { slug: categoryData.slug, status: 1 }
    ]
  });
  if (existingCategory) {
    throw new APIError(
      'Category name or slug already exists',
      StatusCodes.CONFLICT
    );
  }

  // 7️⃣ Validate parent if provided
  if (categoryData.parent) {
    const parentCategory = await Category.findById(categoryData.parent);
    if (!parentCategory || parentCategory.status === 0) {
      throw new APIError('Invalid parent category', StatusCodes.BAD_REQUEST);
    }
  }

  // 8️⃣ Create category
  const category = await Category.create(categoryData);
  const populatedCategory = await Category.findById(category._id).populate('parent');

  // 9️⃣ Debug log
  console.log('Created category:', {
    ...populatedCategory.toObject(),
    metaKeywords: populatedCategory.metaKeywords
  });

  // 10️⃣ Send response
  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Category created successfully',
    data: {
      category: populatedCategory,
      metaKeywords: populatedCategory.metaKeywords
    }
  });
});



exports.getAllCategories = asyncHandler(async (req, res, next) => {
  const { 
    page = 1, 
    limit = 10, 
    search = '', 
    includeDeleted = 'false',
    status,
    highlighted,
    special,
    showInMenu
  } = req.query;

  const filter = { status: includeDeleted === 'true' ? { $in: [0, 1] } : 1 };

  if (status !== undefined && status !== '') {
    filter.status = Number(status);
  }
  if (search) {
    filter.name = { $regex: new RegExp(search, 'i') };
  }
  if (highlighted !== undefined && highlighted !== '') {
    filter.isHighlighted = highlighted === 'true';
  }
  if (special !== undefined && special !== '') {
    filter.isSpecial = special === 'true';
  }
  if (showInMenu !== undefined && showInMenu !== '') {
    filter.showInFilterMenu = showInMenu === 'true';
  }

  const skip = (Number(page) - 1) * Number(limit);
  const categories = await Category.find(filter)
    .populate('parent', 'name slug')
    .sort({ name: 1, createdAt: -1 }) // CHANGED: sort by name instead of sortOrder
    .skip(skip)
    .limit(Number(limit))
    .lean();

  const total = await Category.countDocuments(filter);
  const activeCategories = await Category.find({ status: 1 })
    .populate('parent', 'name slug')
    .lean();

  res.status(StatusCodes.OK).json({
    success: true,
    pagination: { 
      page: Number(page), 
      limit: Number(limit), 
      total, 
      totalPages: Math.ceil(total / Number(limit)),
      hasNext: skip + Number(limit) < total,
      hasPrev: Number(page) > 1
    },
    categories,
    hierarchy: buildCategoryHierarchy(activeCategories),
  });
});

exports.getCategoryById = asyncHandler(async (req, res, next) => {
  const category = await Category.findById(req.params.id)
    .populate('parent', 'name slug image')
    .lean();

  if (!category) {
    throw new APIError('Category not found', StatusCodes.NOT_FOUND);
  }

  const responseData = {
    ...category,
    isDeleted: category.status === 0 && category.deletedAt !== null
  };

  res.status(StatusCodes.OK).json({
    success: true,
    category: responseData
  });
});

exports.updateCategory = asyncHandler(async (req, res, next) => {
  const category = await Category.findById(req.params.id);
  if (!category) {
    throw new APIError('Category not found', StatusCodes.NOT_FOUND);
  }

  if (category.status === 0) {
    throw new APIError('Cannot update deleted category', StatusCodes.BAD_REQUEST);
  }

  const updateData = {};

  if (req.body.name) {
    const newName = req.body.name.trim();
    const newSlug = newName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    const existing = await Category.findOne({
      $or: [
        { name: newName, _id: { $ne: category._id }, status: 1 },
        { slug: newSlug, _id: { $ne: category._id }, status: 1 }
      ]
    });

    if (existing) {
      throw new APIError('Category name or slug already exists', StatusCodes.CONFLICT);
    }

    updateData.name = newName;
    updateData.slug = newSlug;
  }

  if (req.body.metaTitle !== undefined) {
    updateData.metaTitle = req.body.metaTitle.trim() || '';
  }
  if (req.body.metaDescription !== undefined) {
    updateData.metaDescription = req.body.metaDescription.trim() || '';
  }
  if (req.body.icon !== undefined) {
    updateData.icon = req.body.icon.trim() || '';
  }
  if (req.body.status !== undefined) {
    updateData.status = parseInt(req.body.status);
  }

  if (req.body.isHighlighted !== undefined) {
    updateData.isHighlighted = req.body.isHighlighted === 'true';
  }
  if (req.body.isSpecial !== undefined) {
    updateData.isSpecial = req.body.isSpecial === 'true';
  }
  if (req.body.showInFilterMenu !== undefined) {
    updateData.showInFilterMenu = req.body.showInFilterMenu === 'true';
  }

  if (req.body.parent !== undefined) {
    if (req.body.parent === category._id.toString()) {
      throw new APIError('Category cannot be its own parent', StatusCodes.BAD_REQUEST);
    }
    if (req.body.parent) {
      const parentCategory = await Category.findById(req.body.parent);
      if (!parentCategory || parentCategory.status === 0) {
        throw new APIError('Invalid parent category', StatusCodes.BAD_REQUEST);
      }
    }
    updateData.parent = req.body.parent || null;
  }

  // Handle metaKeywords array
  if (req.body.metaKeywords) {
    const keywords = [];
    Object.keys(req.body).forEach(key => {
      if (key.startsWith('metaKeywords[') && key.endsWith(']')) {
        const keyword = req.body[key]?.trim();
        if (keyword) keywords.push(keyword);
      }
    });
    updateData.metaKeywords = keywords.length > 0 ? keywords : [];
  }

  if (req.file) {
    updateData.image = req.file.path;
  }

  Object.assign(category, updateData);
  await category.save();

  const updatedCategory = await Category.findById(category._id).populate('parent');
  
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Category updated successfully',
    category: updatedCategory
  });
});

exports.softDeleteCategory = asyncHandler(async (req, res, next) => {
  const category = await Category.findById(req.params.id);
  if (!category) {
    throw new APIError('Category not found', StatusCodes.NOT_FOUND);
  }

  if (category.status === 0) {
    throw new APIError('Category is already deleted', StatusCodes.BAD_REQUEST);
  }

  const activeChildren = await Category.find({
    parent: req.params.id,
    status: 1
  });

  if (activeChildren.length > 0) {
    throw new APIError(
      `Cannot delete category. It has ${activeChildren.length} active subcategories`,
      StatusCodes.BAD_REQUEST
    );
  }

  category.status = 0;
  category.deletedAt = new Date();
  await category.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Category soft deleted successfully'
  });
});

exports.restoreCategory = asyncHandler(async (req, res, next) => {
  const category = await Category.findById(req.params.id);
  if (!category) {
    throw new APIError('Category not found', StatusCodes.NOT_FOUND);
  }

  if (category.status === 1) {
    throw new APIError('Category is not deleted', StatusCodes.BAD_REQUEST);
  }

  category.status = 1;
  category.deletedAt = undefined;
  await category.save();

  const restoredCategory = await Category.findById(category._id).populate('parent');
  
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Category restored successfully',
    category: restoredCategory
  });
});

exports.getCategoryHierarchy = asyncHandler(async (req, res) => {
  const categories = await Category.find({ status: 1 })
    .populate('parent', 'name slug image')
    .sort({ name: 1 }) // CHANGED: sort by name
    .lean();

  res.status(StatusCodes.OK).json({
    success: true,
    hierarchy: buildCategoryHierarchy(categories),
    flat: categories
  });
});

exports.getHighlightedCategories = asyncHandler(async (req, res) => {
  const { limit = 10, withChildren = 'false' } = req.query;
  
  const query = {
    status: 1,
    isHighlighted: true
  };

  let categories;
  if (withChildren === 'true') {
    categories = await Category.find(query)
      .populate({
        path: 'parent',
        populate: { path: 'parent' }
      })
      .lean();
  } else {
    categories = await Category.find(query)
      .populate('parent', 'name slug')
      .sort({ name: 1 }) // CHANGED: sort by name
      .limit(Number(limit))
      .lean();
  }

  res.status(StatusCodes.OK).json({
    success: true,
    highlightedCategories: categories,
    total: categories.length
  });
});

function buildCategoryHierarchy(categories, parentId = null) {
  return categories
    .filter(cat => {
      const catParentId = cat.parent?._id?.toString() || null;
      return catParentId === parentId || (!parentId && !catParentId);
    })
    .map(cat => ({
      ...cat,
      children: buildCategoryHierarchy(categories, cat._id.toString())
    }))
    .sort((a, b) => a.name.localeCompare(b.name)); // CHANGED: alphabetical sort
}