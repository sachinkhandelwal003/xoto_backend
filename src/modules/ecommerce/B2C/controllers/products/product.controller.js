// controllers/products/product.controller.js
const ProductB2C = require('../../models/product.model');
const Inventory = require('../../models/productInventory.model');
const Attribute = require('../../models/attributes.model'); // Added for attribute filtering
const Currency = require('../../../../auth/models/currency/currency.model'); // Added for attribute filtering
const Tax = require('../../../../auth/models/tax/tax.model'); // Added for attribute filtering

const { StatusCodes } = require('../../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../../utils/errorHandler');
const asyncHandler = require('../../../../../utils/asyncHandler');
const winston = require('winston');
const mongoose = require('mongoose');

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/product.log' }),
    new winston.transports.Console()
  ]
});




exports.createProduct = asyncHandler(async (req, res, next) => {
  const productData = req.body;

  logger.info('Incoming productData:', JSON.stringify(productData, null, 2));
  logger.info('Incoming files:', JSON.stringify(req.files, null, 2));

  // Vendor only provides base_price and cost_price
  const pricing = {
    base_price: Number(productData['pricing.base_price']) || 0,
    cost_price: Number(productData['pricing.cost_price']) || 0,
    currency: productData['pricing.currency'], // required
    sale_price: 0,      // Admin/system handles this
    discount: undefined, // Admin only
    tax: undefined,      // Admin only
    final_price: 0,      // Calculated in model pre-save hook
    margin: 0            // Calculated in model pre-save hook
  };

  // Parse color variants
  let colorVariants = [];
  if (productData.color_variants) {
    try {
      colorVariants = typeof productData.color_variants === 'string'
        ? JSON.parse(productData.color_variants)
        : productData.color_variants;
    } catch (error) {
      logger.error(`Invalid color_variants format: ${error.message}`);
      throw new APIError('Invalid color_variants format', StatusCodes.BAD_REQUEST);
    }
  }

  // Process color variant images
  for (let i = 0; i < colorVariants.length; i++) {
    const variant = colorVariants[i];
    const colorImages = req.files.filter(file => file.fieldname === `color_images_${i}`);
    variant.images = colorImages.map((file, index) => ({
      url: file.path,
      position: index + 1,
      alt_text: `${productData.name} ${index + 1}`,
      is_primary: index === 0,
      uploaded_at: new Date(),
      verified: false
    }));
  }

  // Handle 3D model
  let threeDModel = null;
  const threeDFile = req.files.find(file => file.fieldname.startsWith('threeDModel_'));
  if (threeDFile) {
    const format = threeDFile.fieldname.split('_')[1] || 'glb';
    threeDModel = {
      url: threeDFile.path,
      format,
      alt_text: productData.three_d_alt || '',
      uploaded_at: new Date(),
      verified: false
    };
  }

  // Handle documents
  const documents = {};
  const documentFields = ['product_invoice', 'product_certificate', 'quality_report'];
  documentFields.forEach(field => {
    const docFile = req.files.find(file => file.fieldname === field);
    if (docFile) {
      documents[field] = {
        type: field,
        path: docFile.path,
        verified: false,
        uploaded_at: new Date()
      };
    }
  });

  // Prepare product data
  const finalProductData = {
    ...productData,
    pricing,
    color_variants: colorVariants,
    three_d_model: threeDModel,
    documents,
    status: 'pending_verification',
    verification_status: { status: 'pending' }
  };

  try {
    const product = await ProductB2C.create(finalProductData);

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Product created by vendor and sent for verification',
      data: {
        product: {
          id: product._id,
          name: product.name,
          pricing: product.pricing,
          status: product.status
        }
      }
    });
  } catch (error) {
    logger.error(`Product creation failed: ${error.message}`);
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));
      throw new APIError('Validation failed', StatusCodes.BAD_REQUEST, errors);
    }
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      throw new APIError(`${field} already exists`, StatusCodes.CONFLICT);
    }
    throw new APIError('Failed to create product', StatusCodes.INTERNAL_SERVER_ERROR);
  }
});

// Update product sale_price, discount, and tax (without changing base_price)
exports.updateProductPricing = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { sale_price, discount, tax } = req.body;

  const product = await ProductB2C.findById(id);
  if (!product) {
    throw new APIError('Product not found', StatusCodes.NOT_FOUND);
  }

  // Only superadmin can update pricing, discount, and tax
  if (!req.user.is_superadmin) {
    throw new APIError('Only superadmin can update pricing', StatusCodes.FORBIDDEN);
  }

  // Update sale_price if provided
  if (sale_price !== undefined) product.pricing.sale_price = sale_price;

  // Update discount if provided
  if (discount) {
    if (discount.type) product.pricing.discount.type = discount.type;
    if (discount.value !== undefined) product.pricing.discount.value = discount.value;
    if (discount.valid_till) product.pricing.discount.valid_till = new Date(discount.valid_till);

    // Auto-approve discount
    product.pricing.discount.approved = true;
    product.pricing.discount.approved_by = req.user.id;

    // Validate discount
    if (product.pricing.discount.type === 'percentage' &&
        (product.pricing.discount.value < 0 || product.pricing.discount.value > 100)) {
      throw new APIError('Discount percentage must be between 0 and 100', StatusCodes.BAD_REQUEST);
    }
    if (product.pricing.discount.type === 'fixed' &&
        product.pricing.discount.value > product.pricing.base_price) {
      throw new APIError('Fixed discount cannot exceed base price', StatusCodes.BAD_REQUEST);
    }
  }

  // Update tax if provided
  if (tax) {
    if (tax.tax_id) product.pricing.tax.tax_id = tax.tax_id;
    if (tax.rate !== undefined) {
      if (tax.rate < 0 || tax.rate > 100) {
        throw new APIError('Tax rate must be between 0 and 100', StatusCodes.BAD_REQUEST);
      }
      product.pricing.tax.rate = tax.rate;
    }
  }

  // Save product (pre-save recalculates final_price based on sale_price, discount, and tax)
  await product.save();

  logger.info(`Product pricing updated (sale_price, discount, tax): ${id}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Product sale_price, discount, and tax updated successfully',
    pricing: product.pricing
  });
});



exports.getAllProducts = asyncHandler(async (req, res, next) => {
  const { 
    product_id, 
    page = 1, 
    limit = 10, 
    status, 
    verification_status, 
    vendor_id, 
    category_id,
    search,
    date_filter,
    brand_id,
    tags,
    attributes,
    similar // fetch similar products
  } = req.query;

  const query = {};

  // ------------------------------
  // 1️⃣ Fetch single product by ID (if provided)
  // ------------------------------
  let singleProduct = null;
  if (product_id) {
    if (!mongoose.Types.ObjectId.isValid(product_id)) {
      throw new APIError('Invalid product_id', StatusCodes.BAD_REQUEST);
    }

    singleProduct = await ProductB2C.findById(product_id)
      .populate('vendor', 'full_name store_details.name email')
      .populate('category')
      .populate('brand')
      .populate('material')
      .populate('tags')
      .populate('attributes')
      .populate('pricing.currency')
      .populate('pricing.tax.tax_id')
      .lean();

    if (!singleProduct) {
      throw new APIError('Product not found', StatusCodes.NOT_FOUND);
    }

    query._id = product_id;
  }

  // ------------------------------
  // 2️⃣ Filters
  // ------------------------------
  if (vendor_id) query.vendor = vendor_id;
  if (status) query.status = status;
  if (verification_status) query['verification_status.status'] = verification_status;
  if (category_id) query.category = category_id;
  if (brand_id) query.brand = brand_id;

  if (tags) {
    const tagsArray = tags.split(',').map(tag => tag.trim());
    if (tagsArray.some(tag => !mongoose.Types.ObjectId.isValid(tag))) {
      throw new APIError('Invalid tag ID', StatusCodes.BAD_REQUEST);
    }
    query.tags = { $in: tagsArray };
  }

  if (attributes && !product_id) {
    try {
      const attributesArray = JSON.parse(attributes);
      const attrIds = [];
      for (const attr of attributesArray) {
        const attributeDoc = await Attribute.findOne({ name: attr.name, values: attr.value });
        if (attributeDoc) attrIds.push(attributeDoc._id);
      }
      if (attrIds.length) query.attributes = { $all: attrIds };
    } catch {
      throw new APIError('Invalid attributes filter format', StatusCodes.BAD_REQUEST);
    }
  }

  if (!product_id && search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { short_description: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  if (!product_id && date_filter) {
    const now = new Date();
    const start = new Date();
    switch (date_filter) {
      case 'today':
        start.setHours(0,0,0,0);
        query.created_at = { $gte: start, $lte: new Date(now.setHours(23,59,59,999)) };
        break;
      case 'week':
        start.setDate(start.getDate() - 7);
        query.created_at = { $gte: start };
        break;
      case 'month':
        start.setDate(start.getDate() - 30);
        query.created_at = { $gte: start };
        break;
      case 'new':
        start.setDate(start.getDate() - 1);
        query.created_at = { $gte: start };
        break;
    }
  }

  // ------------------------------
  // 3️⃣ Fetch Products
  // ------------------------------
  let productsQuery = ProductB2C.find(query)
    .populate('vendor', 'full_name store_details.name email')
    .populate('category')
    .populate('brand')
    .populate('material')
    .populate('tags')
    .populate('attributes')
    .populate('pricing.currency')
    .populate('pricing.tax.tax_id')
    .sort({ createdAt: -1 }) // ✅ corrected to use createdAt
    .lean();

  if (!product_id) {
    productsQuery = productsQuery.skip((page - 1) * limit).limit(Number(limit));
  }

  const products = await productsQuery;
  const total = await ProductB2C.countDocuments(query);

  // ------------------------------
  // 4️⃣ Attach Stock Data (Inventory)
  // ------------------------------
  const productIds = products.map(p => p._id);
  const inventoryData = await Inventory.aggregate([
    { $match: { product: { $in: productIds } } },
    {
      $group: {
        _id: '$product',
        total_quantity: { $sum: '$quantity' },
        total_reserved: { $sum: '$reserved' },
        total_available: { $sum: { $subtract: ['$quantity', '$reserved'] } }
      }
    }
  ]);

  const stockMap = {};
  inventoryData.forEach(inv => {
    stockMap[inv._id.toString()] = {
      total_quantity: inv.total_quantity,
      total_reserved: inv.total_reserved,
      total_available: inv.total_available
    };
  });

  // Attach stock info to each product
  products.forEach(product => {
    product.stock = stockMap[product._id.toString()] || {
      total_quantity: 0,
      total_reserved: 0,
      total_available: 0
    };
  });

  // ------------------------------
  // 5️⃣ Stats (for list)
  // ------------------------------
  let stats = {};
  if (!product_id) {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(); monthStart.setDate(monthStart.getDate() - 30);

    stats = {
      total,
      today: await ProductB2C.countDocuments({ ...query, createdAt: { $gte: todayStart } }),
      week: await ProductB2C.countDocuments({ ...query, createdAt: { $gte: weekStart } }),
      month: await ProductB2C.countDocuments({ ...query, createdAt: { $gte: monthStart } }),
    };
  }

  // ------------------------------
  // 6️⃣ Similar Products
  // ------------------------------
  let similarProducts = [];
  if (similar === 'true' && singleProduct) {
    const { _id, category, brand, tags } = singleProduct;

    const similarQuery = {
      _id: { $ne: _id },
      status: 'active',
      $or: [
        { category: category?._id },
        { brand: brand?._id },
        { tags: { $in: tags?.map(t => t._id) || [] } }
      ]
    };

    similarProducts = await ProductB2C.find(similarQuery)
      .populate('brand')
      .populate('category')
      .populate('pricing.currency')
      .populate('pricing.tax.tax_id')
      .limit(10)
      .lean();
  }

  // ------------------------------
  // 7️⃣ Final Response
  // ------------------------------
  logger.info(`Retrieved ${products.length} products`);

  res.status(StatusCodes.OK).json({
    success: true,
    pagination: product_id ? undefined : {
      totalRecords: total,
      currentPage: Number(page),
      totalPages: Math.ceil(total / limit),
      perPage: Number(limit)
    },
    stats: product_id ? undefined : stats,
    products,
    similar_products: similarProducts.length ? similarProducts : undefined,
  });
});




// Get Product by ID
exports.getProductById = asyncHandler(async (req, res, next) => {
  let productQuery = ProductB2C.findById(req.params.id)
    .populate('vendor', 'full_name store_details.name email')
    .populate('category', 'name')
    .populate('brand', 'name')
    .populate('material', 'name')
    .populate('attributes', 'name values')
    .populate('tags', 'name');

  if (!req.user.is_superadmin) {
    productQuery.select('-documents.*.reason -documents.*.suggestion -color_variants.*.images.*.reason -color_variants.*.images.*.suggestion -three_d_model.reason -three_d_model.suggestion');
  }

  const product = await productQuery.lean();

  if (!product) {
    logger.warn(`Product not found: ${req.params.id}`);
    throw new APIError('Product not found', StatusCodes.NOT_FOUND);
  }

  // Check vendor access
  if (req.user && req.user.role === 'Vendor-B2C' && !req.user.is_superadmin) {
    if (product.vendor._id.toString() !== req.user.id) {
      throw new APIError('Unauthorized: You can only view your own products', StatusCodes.FORBIDDEN);
    }
  }

  logger.info(`Retrieved product: ${req.params.id}`);
  res.status(StatusCodes.OK).json({
    success: true,
    product
  });
});

// Update Product
exports.updateProduct = asyncHandler(async (req, res, next) => {
  const product = await ProductB2C.findById(req.params.id);
  if (!product) {
    logger.warn(`Product not found for update: ${req.params.id}`);
    throw new APIError('Product not found', StatusCodes.NOT_FOUND);
  }

  // Check vendor access
  if (req.user && req.user.role === 'Vendor-B2C' && !req.user.is_superadmin) {
    if (product.vendor.toString() !== req.user.id) {
      throw new APIError('Unauthorized: You can only update your own products', StatusCodes.FORBIDDEN);
    }
    if (product.verification_status.status === 'approved') {
      throw new APIError('Cannot update approved product. Create a new version instead', StatusCodes.FORBIDDEN);
    }
  }

  const updatedData = req.body;

  // Parse color_variants if provided
  let colorVariants = product.color_variants;
  if (updatedData.color_variants) {
    colorVariants = typeof updatedData.color_variants === 'string' ? JSON.parse(updatedData.color_variants) : updatedData.color_variants;
    for (let i = 0; i < colorVariants.length; i++) {
      const variant = colorVariants[i];
      const colorImages = req.files.filter(file => file.fieldname === `color_images_${i}`);
      if (colorImages.length > 0) {
        if (colorImages.length > 5) {
          throw new APIError(`Maximum 5 images allowed per color variant`, StatusCodes.BAD_REQUEST);
        }
        const images = colorImages.map((file, index) => ({
          url: file.path,
          position: index + 1,
          alt_text: `${updatedData.name || product.name} ${index + 1}`,
          is_primary: index === 0,
          uploaded_at: new Date(),
          verified: false,
          reason: null,
          suggestion: null
        }));
        variant.images = images;
      }
    }
    updatedData.color_variants = colorVariants;
  }

  // Handle 3D model update
  const threeDFile = req.files.find(file => file.fieldname.startsWith('threeDModel_'));
  if (threeDFile) {
    const format = threeDFile.fieldname.split('_')[1] || 'glb';
    product.three_d_model = {
      url: threeDFile.path,
      format,
      alt_text: updatedData.three_d_alt || '',
      uploaded_at: new Date(),
      verified: false,
      reason: null,
      suggestion: null
    };
  }

  // Handle document updates
  const documentFields = ['product_invoice', 'product_certificate', 'quality_report'];
  documentFields.forEach(field => {
    const docFile = req.files.find(file => file.fieldname === field);
    if (docFile) {
      if (!product.documents[field] || !product.documents[field].verified) {
        product.documents[field] = {
          type: field,
          path: docFile.path,
          verified: false,
          uploaded_at: new Date(),
          reason: null,
          suggestion: null
        };
      }
    }
  });

  // Vendor cannot approve discount on update
  if (updatedData.pricing?.discount) {
    updatedData.pricing.discount.approved = false;
    updatedData.pricing.discount.approved_by = null;
  }

  Object.assign(product, updatedData);
  product.updated_at = new Date();

  // Recalculate in pre-save

  // If status changed to pending_verification, reset verification_status
  if (updatedData.status === 'pending_verification') {
    product.verification_status = {
      status: 'pending',
      verified_by: null,
      verified_at: null,
      rejection_reason: null,
      suggestion: null
    };
  }

  const updatedProduct = await product.save();

  logger.info(`Product updated successfully: ${product._id}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Product updated successfully',
    product: {
      id: updatedProduct._id,
      name: updatedProduct.name,
      status: updatedProduct.status,
      verification_status: updatedProduct.verification_status
    }
  });
});

// Delete Product
exports.deleteProduct = asyncHandler(async (req, res, next) => {
  const product = await ProductB2C.findById(req.params.id);
  if (!product) {
    logger.warn(`Product not found for deletion: ${req.params.id}`);
    throw new APIError('Product not found', StatusCodes.NOT_FOUND);
  }

  // Check vendor access
  if (req.user && req.user.role === 'Vendor-B2C' && !req.user.is_superadmin) {
    if (product.vendor.toString() !== req.user.id) {
      throw new APIError('Unauthorized: You can only delete your own products', StatusCodes.FORBIDDEN);
    }
    if (product.verification_status.status === 'approved') {
      throw new APIError('Cannot delete approved product', StatusCodes.FORBIDDEN);
    }
  }

  await ProductB2C.findByIdAndDelete(req.params.id);

  logger.info(`Product deleted successfully: ${req.params.id}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Product deleted successfully'
  });
});

exports.verifyProductAndAssets = asyncHandler(async (req, res, next) => {
  const { status, rejection_reason, suggestion } = req.body;
  const { id } = req.params;

  if (!['approved', 'rejected'].includes(status)) {
    throw new APIError('Status must be either approved or rejected', StatusCodes.BAD_REQUEST);
  }

  if (status === 'rejected' && (!rejection_reason || !rejection_reason.trim())) {
    throw new APIError('Rejection reason is required when rejecting a product', StatusCodes.BAD_REQUEST);
  }

  const product = await ProductB2C.findById(id);
  if (!product) {
    logger.warn(`Product not found for verification: ${id}`);
    throw new APIError('Product not found', StatusCodes.NOT_FOUND);
  }

  // Update product verification status
  product.verification_status = {
    status,
    verified_by: req.user.id,
    verified_at: new Date(),
    ...(status === 'rejected' && { rejection_reason, suggestion }),
  };

  // Update product status
  product.status = status === 'approved' ? 'active' : 'rejected';

  // Update all assets (documents, images, 3D model)
  const documentFields = ['product_invoice', 'product_certificate', 'quality_report'];
  const assetErrors = [];

  // Update documents
  documentFields.forEach((field) => {
    if (product.documents[field]) {
      product.documents[field].verified = status === 'approved';
      if (status === 'rejected') {
        product.documents[field].reason = rejection_reason;
        product.documents[field].suggestion = suggestion;
      } else {
        product.documents[field].reason = null;
        product.documents[field].suggestion = null;
      }
    }
  });

  // Update color variant images
  product.color_variants.forEach((variant) => {
    variant.images.forEach((image) => {
      image.verified = status === 'approved';
      if (status === 'rejected') {
        image.reason = rejection_reason;
        image.suggestion = suggestion;
      } else {
        image.reason = null;
        image.suggestion = null;
      }
    });
  });

  // Update 3D model (if exists)
  if (product.three_d_model) {
    product.three_d_model.verified = status === 'approved';
    if (status === 'rejected') {
      product.three_d_model.reason = rejection_reason;
      product.three_d_model.suggestion = suggestion;
    } else {
      product.three_d_model.reason = null;
      product.three_d_model.suggestion = null;
    }
  }

  // Save product with all updates
  await product.save();

  logger.info(`Product and assets verification updated: ${product._id}, status: ${status}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: status === 'approved' ? 'Product and assets approved successfully' : 'Product and assets rejected',
    product: {
      id: product._id,
      name: product.name,
      status: product.status,
      verification_status: product.verification_status,
      documents: product.documents,
      color_variants: product.color_variants,
      three_d_model: product.three_d_model,
    },
  });
});


exports.updateAsset = asyncHandler(async (req, res, next) => {
  const { productId, assetId } = req.params;
  const { type } = req.body; // Optional, for validation

  const product = await ProductB2C.findById(productId);
  if (!product) {
    logger.warn(`Product not found for asset update: ${productId}`);
    throw new APIError('Product not found', StatusCodes.NOT_FOUND);
  }

  let asset = null;
  let assetField = null;
  let assetTypeFound = null;
  let variantIndex = -1;
  let imageIndex = -1;

  // Check documents
  const documentFields = ['product_invoice', 'product_certificate', 'quality_report'];
  for (const field of documentFields) {
    if (product.documents[field] && product.documents[field]._id.toString() === assetId) {
      asset = product.documents[field];
      assetField = field;
      assetTypeFound = 'document';
      break;
    }
  }

  // Check color variant images
  if (!asset) {
    for (let vi = 0; vi < product.color_variants.length; vi++) {
      const variant = product.color_variants[vi];
      const ii = variant.images.findIndex(img => img._id.toString() === assetId);
      if (ii !== -1) {
        variantIndex = vi;
        imageIndex = ii;
        asset = variant.images[ii];
        assetTypeFound = 'image';
        break;
      }
    }
  }

  // Check 3D model
  if (!asset && product.three_d_model && product.three_d_model._id.toString() === assetId) {
    asset = product.three_d_model;
    assetTypeFound = 'three_d_model';
  }

  if (!asset) {
    throw new APIError('Asset not found', StatusCodes.NOT_FOUND);
  }

  if (asset.verified) {
    throw new APIError('Cannot update verified asset', StatusCodes.FORBIDDEN);
  }

  if (!req.file) {
    throw new APIError('File is required for update', StatusCodes.BAD_REQUEST);
  }

  // Validate type if provided
  if (type && type !== assetTypeFound) {
    throw new APIError('Provided type does not match asset type', StatusCodes.BAD_REQUEST);
  }

  // Update the asset file path or url
  if (assetTypeFound === 'document') {
    asset.path = req.file.path;
  } else {
    asset.url = req.file.path;
  }

  asset.uploaded_at = new Date();
  asset.verified = false;
  asset.reason = null;
  asset.suggestion = null;

  product.updated_at = new Date();

  await product.save();

  logger.info(`Asset updated successfully: ${assetId} for product ${productId}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Asset updated successfully',
    asset: {
      id: asset._id,
      type: assetTypeFound,
      path: asset.path || asset.url,
      verified: asset.verified,
      uploaded_at: asset.uploaded_at
    }
  });
});

// Update Asset Verification
exports.updateAssetVerification = asyncHandler(async (req, res, next) => {
  const { verified, reason, suggestion } = req.body;
  const { productId, assetId } = req.params;

  const product = await ProductB2C.findById(productId);
  if (!product) {
    throw new APIError('Product not found', StatusCodes.NOT_FOUND);
  }

  let asset = null;
  let assetField = null;
  let assetType = null;
  let variantIndex = -1;
  let imageIndex = -1;

  // Check documents
  const documentFields = ['product_invoice', 'product_certificate', 'quality_report'];
  for (const field of documentFields) {
    if (product.documents[field] && product.documents[field]._id.toString() === assetId) {
      asset = product.documents[field];
      assetField = field;
      assetType = 'document';
      break;
    }
  }

  // Check color variant images
  if (!asset) {
    for (let vi = 0; vi < product.color_variants.length; vi++) {
      const variant = product.color_variants[vi];
      const ii = variant.images.findIndex(img => img._id.toString() === assetId);
      if (ii !== -1) {
        variantIndex = vi;
        imageIndex = ii;
        asset = variant.images[ii];
        assetType = 'image';
        break;
      }
    }
  }

  // Check 3D model
  if (!asset && product.three_d_model && product.three_d_model._id.toString() === assetId) {
    asset = product.three_d_model;
    assetType = 'three_d_model';
  }

  if (!asset) {
    throw new APIError('Asset not found', StatusCodes.NOT_FOUND);
  }

  asset.verified = verified;
  if (verified) {
    asset.reason = null;
    asset.suggestion = null;
  } else {
    asset.reason = reason;
    asset.suggestion = suggestion;
  }

  // Check if all assets are verified
  const allDocumentsVerified = documentFields.every(field => 
    !product.documents[field] || product.documents[field].verified
  );
  let allImagesVerified = true;
  product.color_variants.forEach(variant => {
    if (!variant.images.every(img => img.verified)) {
      allImagesVerified = false;
    }
  });
  const threeDVerified = !product.three_d_model || product.three_d_model.verified;

  if (allDocumentsVerified && allImagesVerified && threeDVerified && product.verification_status.status === 'pending') {
    product.verification_status = {
      status: 'approved',
      verified_by: req.user.id,
      verified_at: new Date()
    };
    product.status = 'active';
  }

  product.updated_at = new Date();
  await product.save();

  logger.info(`Asset verification updated for product: ${product._id}, type: ${assetType}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: verified ? 'Asset approved successfully' : 'Asset rejected',
    product: {
      id: product._id,
      documents: product.documents,
      color_variants: product.color_variants,
      three_d_model: product.three_d_model,
      verification_status: product.verification_status
    }
  });
});
exports.createInventory = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;
  const { sku, quantity, low_stock_threshold = 5, warehouse, note } = req.body;

  if (!sku || quantity === undefined) {
    throw new APIError('SKU and quantity are required', StatusCodes.BAD_REQUEST);
  }

  if (quantity < 0) {
    throw new APIError('Quantity cannot be negative', StatusCodes.BAD_REQUEST);
  }

  // Check product
  const product = await ProductB2C.findById(productId);
  if (!product) throw new APIError('Product not found', StatusCodes.NOT_FOUND);
  if (product.verification_status.status !== 'approved') {
    throw new APIError('Product must be approved before creating inventory', StatusCodes.FORBIDDEN);
  }

  // Check duplicate (per product + SKU + warehouse)
  const existing = await Inventory.findOne({ product: productId, sku, warehouse: warehouse || null });
  if (existing) {
    throw new APIError(`Inventory with SKU ${sku} already exists for this product`, StatusCodes.CONFLICT);
  }

  const inventoryItem = await Inventory.create({
    product: productId,
    sku,
    quantity,
    reserved: 0,
    low_stock_threshold,
    low_stock: quantity <= low_stock_threshold,
    warehouse: warehouse || null,
    movements: [{
      type: 'initial',
      quantity,
      note: note || 'Initial stock creation',
      date: new Date()
    }]
  });

  product.updated_at = new Date();
  await product.save();

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Inventory created successfully',
    inventory: inventoryItem
  });
});

// Update Inventory
exports.updateInventory = asyncHandler(async (req, res, next) => {
  const { sku, quantity, type = 'adjustment', note } = req.body;
  const { productId } = req.params;

  // Validate required fields
  if (!sku || quantity === undefined) {
    throw new APIError('SKU and quantity are required', StatusCodes.BAD_REQUEST);
  }

  // Validate quantity
  if (quantity < 0) {
    throw new APIError('Quantity cannot be negative', StatusCodes.BAD_REQUEST);
  }

  // Validate productId
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new APIError('Invalid product ID', StatusCodes.BAD_REQUEST);
  }

  // Fetch product
  const product = await ProductB2C.findById(productId);
  if (!product) {
    throw new APIError('Product not found', StatusCodes.NOT_FOUND);
  }

  if (product.verification_status.status !== 'approved') {
    throw new APIError('Product must be approved before managing inventory', StatusCodes.FORBIDDEN);
  }

  // Check vendor access
  if (req.user.role === 'Vendor-B2C' && product.vendor.toString() !== req.user.id) {
    throw new APIError('Unauthorized: You can only manage inventory for your own products', StatusCodes.FORBIDDEN);
  }

  // Fetch inventory item
  const inventoryItem = await Inventory.findOne({ product: productId, sku });
  if (!inventoryItem) {
    throw new APIError(`Inventory with SKU ${sku} not found for this product`, StatusCodes.NOT_FOUND);
  }

  // Start MongoDB transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Record movement
    const movement = {
      type,
      quantity,
      note: note || '',
      date: new Date()
    };

    // Update quantity based on type
    switch (type) {
      case 'in':
        inventoryItem.quantity += quantity;
        break;
      case 'out':
        if (inventoryItem.quantity < quantity) {
          throw new APIError('Insufficient stock', StatusCodes.BAD_REQUEST);
        }
        inventoryItem.quantity -= quantity;
        break;
      case 'adjustment':
        inventoryItem.quantity = quantity;
        break;
      default:
        throw new APIError('Invalid inventory movement type', StatusCodes.BAD_REQUEST);
    }

    // Update low stock status
    inventoryItem.low_stock = inventoryItem.quantity <= inventoryItem.low_stock_threshold;
    inventoryItem.movements.push(movement);
    inventoryItem.updated_at = new Date();

    // Save inventory item
    await inventoryItem.save({ session });

    // Update product's updated_at
    product.updated_at = new Date();
    await product.save({ session });

    await session.commitTransaction();
    logger.info(`Inventory updated for product: ${productId}, SKU: ${sku}, new quantity: ${inventoryItem.quantity}`);

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Inventory updated successfully',
      inventory: {
        id: inventoryItem._id,
        sku: inventoryItem.sku,
        quantity: inventoryItem.quantity,
        reserved: inventoryItem.reserved,
        low_stock: inventoryItem.low_stock,
        movement
      }
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Inventory update failed for product: ${productId}, SKU: ${sku}, error: ${error.message}`);
    throw error;
  } finally {
    session.endSession();
  }
});

// Get Inventory History with type and date range filters
exports.getInventoryHistory = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;
  const { sku, type, startDate, endDate, page = 1, limit = 10 } = req.query;

  // Validate productId
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new APIError('Invalid product ID', StatusCodes.BAD_REQUEST);
  }

  // Fetch product
  const product = await ProductB2C.findById(productId);
  if (!product) {
    throw new APIError('Product not found', StatusCodes.NOT_FOUND);
  }

  if (product.verification_status.status !== 'approved') {
    throw new APIError('Product must be approved to view inventory history', StatusCodes.FORBIDDEN);
  }

  // Build query
  const matchQuery = { product: new mongoose.Types.ObjectId(productId) };
  if (sku) {
    matchQuery.sku = { $regex: `^${sku}$`, $options: 'i' };
  }

  // Aggregation pipeline for movements
  const pipeline = [
    { $match: matchQuery },
    { $unwind: { path: '$movements', preserveNullAndEmptyArrays: false } },
  ];

  // Filter by type if provided
  if (type) {
    pipeline.push({ $match: { 'movements.type': type } });
  }

  // Filter by date range if provided
  if (startDate || endDate) {
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    pipeline.push({ $match: { 'movements.date': dateFilter } });
  }

  // Sort, paginate, project
  pipeline.push(
    { $sort: { 'movements.date': -1 } },
    { $skip: (Number(page) - 1) * Number(limit) },
    { $limit: Number(limit) },
    {
      $project: {
        _id: 0,
        sku: 1,
        type: '$movements.type',
        quantity: '$movements.quantity',
        note: '$movements.note',
        date: '$movements.date'
      }
    }
  );

  const movements = await Inventory.aggregate(pipeline);

  // Total count for pagination
  const countPipeline = [
    { $match: matchQuery },
    { $unwind: '$movements' },
  ];
  if (type) countPipeline.push({ $match: { 'movements.type': type } });
  if (startDate || endDate) {
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    countPipeline.push({ $match: { 'movements.date': dateFilter } });
  }
  countPipeline.push({ $count: 'total' });

  const totalResult = await Inventory.aggregate(countPipeline);
  const total = totalResult[0]?.total || 0;

  res.status(StatusCodes.OK).json({
    success: true,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total
    },
    movements
  });
});

exports.getProductInventory = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;
  const { sku, warehouse, page = 1, limit = 10 } = req.query;

  // ✅ Check product exists
  const product = await ProductB2C.findById(productId);
  if (!product) {
    logger.warn(`Product not found for inventory retrieval: ${productId}`);
    throw new APIError('Product not found', StatusCodes.NOT_FOUND);
  }

  // ✅ Ensure approved
  if (product.verification_status.status !== 'approved') {
    throw new APIError('Product must be approved to view inventory', StatusCodes.FORBIDDEN);
  }

  // ✅ Build query (no manual ObjectId creation)
  const matchQuery = { product: productId };
  if (sku) {
    matchQuery.sku = sku;
  }
  if (warehouse) {
    if (!mongoose.Types.ObjectId.isValid(warehouse)) {
      throw new APIError('Invalid warehouse ID', StatusCodes.BAD_REQUEST);
    }
    matchQuery.warehouse = warehouse;
  }

  // ✅ Fetch inventory
  const inventory = await Inventory.find(matchQuery)
    .populate('warehouse', 'name location')
    .select('sku quantity reserved low_stock low_stock_threshold warehouse created_at updated_at')
    .sort({ updated_at: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .lean();

  const total = await Inventory.countDocuments(matchQuery);

  logger.info(`Retrieved inventory for product: ${productId}, found ${inventory.length} items`);

  res.status(StatusCodes.OK).json({
    success: true,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total
    },
    inventory
  });
});