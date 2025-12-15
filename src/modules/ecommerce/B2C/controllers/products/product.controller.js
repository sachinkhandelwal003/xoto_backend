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


exports.createProduct = asyncHandler(async (req, res) => {
  const body = req.body;

  const attributes = body.attributes || [];
  const tags = body.tags || [];
  const colorVariants = body.color_variants || [];

  // Attach images per color
  colorVariants.forEach((variant, i) => {
    const files = req.files.filter(
      f => f.fieldname === `color_images_${i}`
    );

    variant.images = files.map((file, idx) => ({
      url: file.path,
      is_primary: idx === 0,
      verified: false
    }));
  });

  // ✅ FIX: build pricing manually (form-data safe)
  const pricing = {
    cost_price: Number(body['pricing.cost_price']),
    base_price: Number(body['pricing.base_price']),
    currency: body['pricing.currency']
  };

  const product = await ProductB2C.create({
    vendor: req.user.id,
    name: body.name,
    description: body.description,
    short_description: body.short_description,
    category: body.category,
    brand: body.brand,
    material: body.material,
    attributes,
    tags,
    pricing,
    color_variants: colorVariants,
    status: 'pending_verification',
    verification_status: { status: 'pending' }
  });

  res.status(201).json({
    success: true,
    message: 'Product submitted for verification',
    product
  });
});


exports.updateProductPricing = asyncHandler(async (req, res) => {
  const product = await ProductB2C.findById(req.params.id);
  if (!product) throw new APIError('Product not found', StatusCodes.NOT_FOUND);

  product.pricing.mrp = req.body.mrp;
  product.pricing.sale_price = req.body.sale_price;

  if (req.body.discount) {
    product.pricing.discount = {
      ...req.body.discount,
      approved: true,
      approved_by: req.user.id
    };
  }

  if (req.body.tax) product.pricing.tax = req.body.tax;

  product.status = 'active';

  await product.save();

  res.json({
    success: true,
    message: 'Pricing updated and product activated',
    pricing: product.pricing
  });
});

// controllers/products/product.controller.js

exports.getVendorProducts = asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    status,
    verification_status, // 👈 added
    category_id,
    brand_id,
    search
  } = req.query;

  // 🔐 Vendor from token only
  const query = {
    vendor: req.user.id
  };

  // Optional filters
  if (status) query.status = status;

  // ✅ SAME AS getAllProducts
  if (verification_status) {
    query['verification_status.status'] = verification_status;
  }

  if (category_id) query.category = category_id;
  if (brand_id) query.brand = brand_id;

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { short_description: { $regex: search, $options: 'i' } }
    ];
  }

  let productsQuery = ProductB2C.find(query)
    .populate('category', 'name')
    .populate('brand', 'name')
    .populate('pricing.currency', 'code symbol')
    .sort({ createdAt: -1 });

  let pagination = null;

  // ✅ Apply pagination ONLY if page or limit is provided
  if (page || limit) {
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;

    productsQuery = productsQuery
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const total = await ProductB2C.countDocuments(query);

    pagination = {
      totalRecords: total,
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      perPage: limitNum
    };
  }

  const products = await productsQuery.lean();

  res.status(StatusCodes.OK).json({
    success: true,
    pagination,
    products
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
  exports.verifyProductAndAssets = asyncHandler(async (req, res) => {
    const { status, rejection_reason, suggestion } = req.body;

    const product = await ProductB2C.findById(req.params.id);
    if (!product) {
      throw new APIError('Product not found', StatusCodes.NOT_FOUND);
    }

    if (!['approved', 'rejected'].includes(status)) {
      throw new APIError('Invalid status', StatusCodes.BAD_REQUEST);
    }

    product.verification_status = {
      status,
      verified_by: req.user.id,
      verified_at: new Date(),
      rejection_reason: status === 'rejected' ? rejection_reason : null,
      suggestion: status === 'rejected' ? suggestion : null
    };

    // ❗ IMPORTANT
    product.status = status === 'approved'
      ? 'pending_verification'
      : 'rejected';

    await product.save();

    res.status(StatusCodes.OK).json({
      success: true,
      message: `Product ${status}`,
      product
    });
  });



exports.updateAsset = asyncHandler(async (req, res) => {
  const { productId, assetId } = req.params;

  const product = await ProductB2C.findById(productId);
  if (!product) {
    throw new APIError('Product not found', StatusCodes.NOT_FOUND);
  }

  // Vendor ownership check
  if (product.vendor.toString() !== req.user.id) {
    throw new APIError('Unauthorized', StatusCodes.FORBIDDEN);
  }

  let asset = null;

  // Find image inside color variants
  for (const variant of product.color_variants) {
    const img = variant.images.id(assetId);
    if (img) {
      asset = img;
      break;
    }
  }

  if (!asset) {
    throw new APIError('Asset not found', StatusCodes.NOT_FOUND);
  }

  if (asset.verified) {
    throw new APIError('Verified asset cannot be replaced', StatusCodes.FORBIDDEN);
  }

  if (!req.file) {
    throw new APIError('File is required', StatusCodes.BAD_REQUEST);
  }

  asset.url = req.file.path;
  asset.verified = false;
  asset.reason = null;
  asset.suggestion = null;
  asset.uploaded_at = new Date();

  await product.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Asset updated successfully',
    asset
  });
});

exports.updateAssetVerification = asyncHandler(async (req, res) => {
  const { productId, assetId } = req.params;
  const { verified, reason, suggestion } = req.body;

  const product = await ProductB2C.findById(productId);
  if (!product) {
    throw new APIError('Product not found', StatusCodes.NOT_FOUND);
  }

  let asset = null;

  for (const variant of product.color_variants) {
    const img = variant.images.id(assetId);
    if (img) {
      asset = img;
      break;
    }
  }

  if (!asset) {
    throw new APIError('Asset not found', StatusCodes.NOT_FOUND);
  }

  asset.verified = verified;
  asset.reason = verified ? null : reason;
  asset.suggestion = verified ? null : suggestion;

  // ✅ Check if ALL images are verified
  const allImagesVerified = product.color_variants.every(v =>
    v.images.every(img => img.verified)
  );

  if (allImagesVerified &&
      product.verification_status.status === 'approved') {
    product.status = 'active';
  }

  await product.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: verified ? 'Asset approved' : 'Asset rejected',
    product_status: product.status
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