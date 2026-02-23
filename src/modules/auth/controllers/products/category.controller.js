const asyncHandler = require('../../../../utils/asyncHandler');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const { Category, Subcategory } = require('../../models/products/category.model');

exports.createCategory = asyncHandler(async (req, res, next) => {
  try {
    const { name } = req.body;

    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      throw new APIError('Category with this name already exists', StatusCodes.CONFLICT);
    }

    const category = await Category.create({ name });

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Category created successfully',
      category
    });
  } catch (error) {
    next(error);
  }
});

exports.getAllCategories = asyncHandler(async (req, res, next) => {
  try {
    const categories = await Category.find({}).lean();
    for (const cat of categories) {
      cat.subcategories = await Subcategory.find({ category: cat._id }).lean();
    }

    res.status(StatusCodes.OK).json({
      success: true,
      categories
    });
  } catch (error) {
    next(error);
  }
});

exports.getCategoryById = asyncHandler(async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id).lean();
    if (!category) {
      throw new APIError('Category not found', StatusCodes.NOT_FOUND);
    }
    category.subcategories = await Subcategory.find({ category: category._id }).lean();

    res.status(StatusCodes.OK).json({
      success: true,
      category
    });
  } catch (error) {
    next(error);
  }
});

exports.updateCategory = asyncHandler(async (req, res, next) => {
  try {
    const { name } = req.body;

    const category = await Category.findById(req.params.id);
    if (!category) {
      throw new APIError('Category not found', StatusCodes.NOT_FOUND);
    }

    category.name = name || category.name;

    const updatedCategory = await category.save();

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Category updated successfully',
      category: updatedCategory
    });
  } catch (error) {
    next(error);
  }
});

exports.deleteCategory = asyncHandler(async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      throw new APIError('Category not found', StatusCodes.NOT_FOUND);
    }

       await category.deleteOne();

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

exports.createSubcategory = asyncHandler(async (req, res, next) => {
  try {
    const { name, categoryId } = req.body;

    const category = await Category.findById(categoryId);
    if (!category) {
      throw new APIError('Category not found', StatusCodes.NOT_FOUND);
    }

    const existingSubcategory = await Subcategory.findOne({ name });
    if (existingSubcategory) {
      throw new APIError('Subcategory with this name already exists', StatusCodes.CONFLICT);
    }

    const subcategory = await Subcategory.create({
      name,
      category: categoryId
    });

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Subcategory created successfully',
      subcategory
    });
  } catch (error) {
    next(error);
  }
});

exports.getAllSubcategories = asyncHandler(async (req, res, next) => {
  try {
    const { categoryId } = req.query;
    const query = categoryId ? { category: categoryId } : {};
    const subcategories = await Subcategory.find(query)
      .populate('category')
      .lean();

    res.status(StatusCodes.OK).json({
      success: true,
      subcategories
    });
  } catch (error) {
    next(error);
  }
});

exports.getSubcategoryById = asyncHandler(async (req, res, next) => {
  try {
    const subcategory = await Subcategory.findById(req.params.id)
      .populate('category');
    if (!subcategory) {
      throw new APIError('Subcategory not found', StatusCodes.NOT_FOUND);
    }

    res.status(StatusCodes.OK).json({
      success: true,
      subcategory
    });
  } catch (error) {
    next(error);
  }
});

exports.updateSubcategory = asyncHandler(async (req, res, next) => {
  try {
    const { name, categoryId } = req.body;

    const subcategory = await Subcategory.findById(req.params.id);
    if (!subcategory) {
      throw new APIError('Subcategory not found', StatusCodes.NOT_FOUND);
    }

    if (categoryId) {
      const category = await Category.findById(categoryId);
      if (!category) {
        throw new APIError('Category not found', StatusCodes.NOT_FOUND);
      }
      subcategory.category = categoryId;
    }

    if (name && name !== subcategory.name) {
      const existingSubcategory = await Subcategory.findOne({ name });
      if (existingSubcategory) {
        throw new APIError('Subcategory with this name already exists', StatusCodes.CONFLICT);
      }
      subcategory.name = name;
    }

    const updatedSubcategory = await subcategory.save();

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Subcategory updated successfully',
      subcategory: updatedSubcategory
    });
  } catch (error) {
    next(error);
  }
});

exports.deleteSubcategory = asyncHandler(async (req, res, next) => {
  try {
    const subcategory = await Subcategory.findById(req.params.id);
    if (!subcategory) {
      throw new APIError('Subcategory not found', StatusCodes.NOT_FOUND);
    }

    await subcategory.deleteOne();

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Subcategory deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});