const { StatusCodes } = require('../../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../../utils/errorHandler');
const asyncHandler = require('../../../../../utils/asyncHandler');
const winston = require('winston');
const mongoose = require('mongoose');
const Cart = require('../../models/cart.model');
const Order = require('../../models/order.model');
const Wishlist = require('../../models/wishlist.model');
const Coupon = require('../../models/coupen.model');
const Customer = require('../../../../auth/models/user/customer.model');
const ProductB2C = require('../../models/product.model');
const ProductB2B = require('../../models/productb2b.model');
const Inventory = require('../../models/productInventory.model');
const InventoryB2B = require('../../models/inventoryb2b.model');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/cart_order_wishlist.log' }),
    new winston.transports.Console()
  ]
});

// --- Cart APIs ---

// Create or Update Cart
exports.createOrUpdateCart = asyncHandler(async (req, res, next) => {
  const { product_id, product_type, quantity } = req.body;
  if (!product_id || !product_type || !quantity) {
    throw new APIError('Product ID, type, and quantity are required', StatusCodes.BAD_REQUEST);
  }
  if (!['ProductB2C', 'ProductB2B'].includes(product_type)) {
    throw new APIError('Invalid product type', StatusCodes.BAD_REQUEST);
  }
  
  if (quantity < 1) {
    throw new APIError('Quantity must be at least 1', StatusCodes.BAD_REQUEST);
  }

  const ProductModel = product_type === 'ProductB2C' ? ProductB2C : ProductB2B;
  const InventoryModel = product_type === 'ProductB2C' ? Inventory : InventoryB2B;

  // Verify customer
  const customer = await Customer.findById(req.user.id);
  if (!customer) {
    throw new APIError('Customer not found', StatusCodes.NOT_FOUND);
  }

  // Check product exists and is approved
  const product = await ProductModel.findById(product_id);
  if (!product || product.verification_status?.status !== 'approved') {
    throw new APIError('Product not found or not approved', StatusCodes.NOT_FOUND);
  }

  // Check inventory
  const inventory = await InventoryModel.findOne({ product: product_id });
  if (!inventory || inventory.available < quantity) {
    throw new APIError('Insufficient stock', StatusCodes.BAD_REQUEST);
  }

  // Find or create cart
  let cart = await Cart.findOne({ user: req.user.id });
  if (!cart) {
    cart = new Cart({ user: req.user.id, items: [] });
  }

  // Update or add item
  const itemIndex = cart.items.findIndex(item => item.product.toString() === product_id.toString() && item.product_type === product_type);
  const price = product_type === 'ProductB2C' ? product.pricing.sale_price : (product.pricing.bulk_pricing[0]?.price_per_unit || 0);

  if (itemIndex >= 0) {
    cart.items[itemIndex].quantity = quantity;
    cart.items[itemIndex].price_per_unit = price;
  } else {
    cart.items.push({
      product_type,
      product: product_id,
      quantity,
      price_per_unit: price,
      currency: product.pricing.currency || 'INR'
    });
  }

  await cart.save();

  logger.info(`Cart updated for customer: ${customer.email}, product: ${product_id}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Cart updated successfully',
    cart
  });
});

// Remove Item from Cart
exports.removeCartItem = asyncHandler(async (req, res, next) => {
  const { product_id, product_type } = req.params;
  if (!mongoose.Types.ObjectId.isValid(product_id)) {
    throw new APIError('Invalid product ID', StatusCodes.BAD_REQUEST);
  }
  if (!['ProductB2C', 'ProductB2B'].includes(product_type)) {
    throw new APIError('Invalid product type', StatusCodes.BAD_REQUEST);
  }

  const customer = await Customer.findById(req.user.id);
  if (!customer) {
    throw new APIError('Customer not found', StatusCodes.NOT_FOUND);
  }

  const cart = await Cart.findOne({ user: req.user.id });
  if (!cart) {
    throw new APIError('Cart not found', StatusCodes.NOT_FOUND);
  }

  const itemIndex = cart.items.findIndex(item => item.product.toString() === product_id && item.product_type === product_type);
  if (itemIndex < 0) {
    throw new APIError('Item not found in cart', StatusCodes.NOT_FOUND);
  }

  cart.items.splice(itemIndex, 1);
  await cart.save();

  logger.info(`Item removed from cart for customer: ${customer.email}, product: ${product_id}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Item removed from cart',
    cart
  });
});

// Get Cart
exports.getCart = asyncHandler(async (req, res, next) => {
  const customer = await Customer.findById(req.user.id);
  if (!customer) {
    throw new APIError('Customer not found', StatusCodes.NOT_FOUND);
  }

  const cart = await Cart.findOne({ user: req.user.id })
    .populate({
      path: 'items.product',
      select: 'name pricing.sale_price pricing.bulk_pricing images',
      match: { 'verification_status.status': 'approved' }
    })
    .lean();

  if (!cart) {
    throw new APIError('Cart not found', StatusCodes.NOT_FOUND);
  }

  cart.items = cart.items.filter(item => item.product);

  logger.info(`Retrieved cart for customer: ${customer.email}`);
  res.status(StatusCodes.OK).json({
    success: true,
    cart
  });
});


// Apply Coupon to Cart
exports.applyCoupon = asyncHandler(async (req, res, next) => {
  const { coupon_code } = req.body;
  if (!coupon_code) {
    throw new APIError('Coupon code is required', StatusCodes.BAD_REQUEST);
  }

  const customer = await Customer.findById(req.user.id);
  if (!customer) {
    throw new APIError('Customer not found', StatusCodes.NOT_FOUND);
  }

  const cart = await Cart.findOne({ user: req.user.id });
  if (!cart || cart.items.length === 0) {
    throw new APIError('Cart is empty or not found', StatusCodes.NOT_FOUND);
  }

  const coupon = await Coupon.findOne({ code: coupon_code, status: 'active' });
  if (!coupon) {
    throw new APIError('Invalid or expired coupon', StatusCodes.BAD_REQUEST);
  }

  const now = new Date();
  if (now < coupon.valid_from || now > coupon.valid_till) {
    throw new APIError('Coupon is not valid at this time', StatusCodes.BAD_REQUEST);
  }

  if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
    throw new APIError('Coupon usage limit reached', StatusCodes.BAD_REQUEST);
  }

  // Check per-user usage
  const userOrdersWithCoupon = await Order.countDocuments({ user: req.user.id, coupon: coupon._id });
  if (coupon.usage_per_user && userOrdersWithCoupon >= coupon.usage_per_user) {
    throw new APIError('Coupon usage limit per user reached', StatusCodes.BAD_REQUEST);
  }

  if (coupon.minimum_order_amount && cart.total_amount < coupon.minimum_order_amount) {
    throw new APIError(`Minimum order amount is ${coupon.minimum_order_amount}`, StatusCodes.BAD_REQUEST);
  }

  let applicable = false;
  if (coupon.applicable_to.type === 'all') {
    applicable = true;
  } else if (coupon.applicable_to.type === 'ProductB2C' || coupon.applicable_to.type === 'ProductB2B') {
    applicable = cart.items.every(item => item.product_type === coupon.applicable_to.type);
  } else if (coupon.applicable_to.type === 'specific_products') {
    applicable = cart.items.every(item => coupon.applicable_to.products.map(id => id.toString()).includes(item.product.toString()));
  }

  if (!applicable) {
    throw new APIError('Coupon not applicable to cart items', StatusCodes.BAD_REQUEST);
  }

  cart.coupon = coupon._id;
  await cart.save();

  logger.info(`Coupon ${coupon_code} applied to cart for customer: ${customer.email}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Coupon applied successfully',
    cart
  });
});

// Clear Cart
exports.clearCart = asyncHandler(async (req, res, next) => {
  const customer = await Customer.findById(req.user.id);
  if (!customer) {
    throw new APIError('Customer not found', StatusCodes.NOT_FOUND);
  }

  const cart = await Cart.findOne({ user: req.user.id });
  if (!cart) {
    throw new APIError('Cart not found', StatusCodes.NOT_FOUND);
  }

  cart.items = [];
  cart.coupon = null;
  await cart.save();

  logger.info(`Cart cleared for customer: ${customer.email}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Cart cleared successfully',
    cart
  });
});

// --- Order APIs ---

// Create Order from Cart
exports.createOrder = asyncHandler(async (req, res, next) => {
  const { shipping_address, payment_method } = req.body;
  if (!shipping_address || !payment_method) {
    throw new APIError('Shipping address and payment method are required', StatusCodes.BAD_REQUEST);
  }

  const customer = await Customer.findById(req.user.id);
  if (!customer) {
    throw new APIError('Customer not found', StatusCodes.NOT_FOUND);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const cart = await Cart.findOne({ user: req.user.id }).session(session);
    if (!cart || cart.items.length === 0) {
      throw new APIError('Cart is empty or not found', StatusCodes.NOT_FOUND);
    }

    // Validate inventory and prepare order items
    const orderItems = [];
    for (const item of cart.items) {
      const ProductModel = item.product_type === 'ProductB2C' ? ProductB2C : ProductB2B;
      const InventoryModel = item.product_type === 'ProductB2C' ? Inventory : InventoryB2B;

      const product = await ProductModel.findById(item.product).session(session);
      if (!product || product.verification_status?.status !== 'approved') {
        throw new APIError(`Product ${item.product} is not available`, StatusCodes.BAD_REQUEST);
      }

      const inventory = await InventoryModel.findOne({ product: item.product }).session(session);
      if (!inventory || inventory.available < item.quantity) {
        throw new APIError(`Insufficient stock for product ${item.product}`, StatusCodes.BAD_REQUEST);
      }

      orderItems.push({
        product_type: item.product_type,
        product: item.product,
        quantity: item.quantity,
        price_per_unit: item.price_per_unit,
        currency: item.currency
      });

      inventory.reserved += item.quantity;
      await inventory.save({ session });
    }

    // Apply coupon if present
    let discount = 0;
    if (cart.coupon) {
      const coupon = await Coupon.findById(cart.coupon).session(session);
      if (!coupon || coupon.status !== 'active') {
        throw new APIError('Invalid or expired coupon', StatusCodes.BAD_REQUEST);
      }
      if (coupon.minimum_order_amount && cart.total_amount < coupon.minimum_order_amount) {
        throw new APIError(`Minimum order amount is ${coupon.minimum_order_amount}`, StatusCodes.BAD_REQUEST);
      }
      if (coupon.discount.type === 'percentage') {
        discount = (cart.total_amount * coupon.discount.value) / 100;
        if (coupon.discount.max_discount && discount > coupon.discount.max_discount) {
          discount = coupon.discount.max_discount;
        }
      } else {
        discount = coupon.discount.value;
      }
      coupon.used_count += 1;
      await coupon.save({ session });

      // Apply discount to order items
      const discountPerItem = discount / orderItems.length;
      orderItems.forEach(item => {
        item.discount_applied = { amount: discountPerItem };
      });
    }

    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const order = await Order.create([{
      user: req.user.id,
      order_number: orderNumber,
      items: orderItems,
      total_amount: cart.total_amount - discount,
      currency: cart.currency,
      shipping: {
        address: shipping_address,
        cost: cart.items.some(item => item.product_type === 'ProductB2C' && item.product?.free_shipping) ? 0 : 100,
        free_shipping: cart.items.some(item => item.product_type === 'ProductB2C' && item.product?.free_shipping)
      },
      payment: {
        method: payment_method,
        status: 'pending'
      },
      coupon: cart.coupon
    }], { session });

    cart.items = [];
    cart.coupon = null;
    cart.status = 'converted';
    await cart.save({ session });

    await session.commitTransaction();
    logger.info(`Order created: ${order[0].order_number} for customer: ${customer.email}`);

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Order created successfully',
      order: order[0]
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Order creation failed for customer: ${customer.email}, error: ${error.message}`);
    throw error;
  } finally {
    session.endSession();
  }
});

// Get Order by ID
exports.getOrderById = asyncHandler(async (req, res, next) => {
  const customer = await Customer.findById(req.user.id);
  if (!customer) {
    throw new APIError('Customer not found', StatusCodes.NOT_FOUND);
  }

  const order = await Order.findById(req.params.id)
    .populate({
      path: 'items.product',
      select: 'name pricing.sale_price pricing.bulk_pricing images',
      model: function(doc) {
        return doc.items.product_type === 'ProductB2C' ? ProductB2C : ProductB2B;
      }
    })
    .populate('coupon', 'code discount')
    .lean();

  if (!order) {
    throw new APIError('Order not found', StatusCodes.NOT_FOUND);
  }

  if (req.user.role === 'Customer' && order.user.toString() !== req.user.id) {
    throw new APIError('Unauthorized: You can only view your own orders', StatusCodes.FORBIDDEN);
  }

  logger.info(`Retrieved order: ${order.order_number} for customer: ${customer.email}`);
  res.status(StatusCodes.OK).json({
    success: true,
    order
  });
});

// Get All Orders
exports.getAllOrders = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 10, status, startDate, endDate } = req.query;
  const customer = await Customer.findById(req.user.id);
  if (!customer) {
    throw new APIError('Customer not found', StatusCodes.NOT_FOUND);
  }

  const query = { user: req.user.id };
  if (status) query.status = status;
  if (startDate || endDate) {
    query.ordered_at = {};
    if (startDate) query.ordered_at.$gte = new Date(startDate);
    if (endDate) query.ordered_at.$lte = new Date(endDate);
  }

  const orders = await Order.find(query)
    .populate({
      path: 'items.product',
      select: 'name pricing.sale_price pricing.bulk_pricing images',
      model: function(doc) {
        return doc.items.product_type === 'ProductB2C' ? ProductB2C : ProductB2B;
      }
    })
    .populate('coupon', 'code discount')
    .sort({ ordered_at: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .lean();

  const total = await Order.countDocuments(query);

  logger.info(`Retrieved ${orders.length} orders for customer: ${customer.email}`);
  res.status(StatusCodes.OK).json({
    success: true,
    pagination: { page: Number(page), limit: Number(limit), total },
    orders
  });
});

// Cancel Order (with Password Validation)
exports.cancelOrder = asyncHandler(async (req, res, next) => {
  const { password } = req.body;
  if (!password) {
    throw new APIError('Password is required for cancellation', StatusCodes.BAD_REQUEST);
  }

  const customer = await Customer.findById(req.user.id).select('+password');
  if (!customer) {
    throw new APIError('Customer not found', StatusCodes.NOT_FOUND);
  }

  const isMatch = await customer.comparePassword(password);
  if (!isMatch) {
    throw new APIError('Invalid password', StatusCodes.UNAUTHORIZED);
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    throw new APIError('Order not found', StatusCodes.NOT_FOUND);
  }
  if (order.user.toString() !== req.user.id) {
    throw new APIError('Unauthorized: You can only cancel your own orders', StatusCodes.FORBIDDEN);
  }
  if (!['pending', 'confirmed'].includes(order.status)) {
    throw new APIError('Order cannot be cancelled at this stage', StatusCodes.BAD_REQUEST);
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    order.status = 'cancelled';
    for (const item of order.items) {
      const InventoryModel = item.product_type === 'ProductB2C' ? Inventory : InventoryB2B;
      const inventory = await InventoryModel.findOne({ product: item.product }).session(session);
      if (inventory) {
        inventory.reserved -= item.quantity;
        await inventory.save({ session });
      }
    }
    await order.save({ session });
    await session.commitTransaction();

    logger.info(`Order cancelled: ${order.order_number} by customer: ${customer.email}`);
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Order cancelled successfully',
      order
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Order cancellation failed for customer: ${customer.email}, error: ${error.message}`);
    throw error;
  } finally {
    session.endSession();
  }
});

// --- Wishlist APIs ---

// Add to Wishlist
exports.addToWishlist = asyncHandler(async (req, res, next) => {
  const { product_id, product_type } = req.body;
  if (!product_id || !product_type) {
    throw new APIError('Product ID and type are required', StatusCodes.BAD_REQUEST);
  }
  if (!['ProductB2C', 'ProductB2B'].includes(product_type)) {
    throw new APIError('Invalid product type', StatusCodes.BAD_REQUEST);
  }
  if (!mongoose.Types.ObjectId.isValid(product_id)) {
    throw new APIError('Invalid product ID', StatusCodes.BAD_REQUEST);
  }

  const customer = await Customer.findById(req.user.id);
  if (!customer) {
    throw new APIError('Customer not found', StatusCodes.NOT_FOUND);
  }

  const ProductModel = product_type === 'ProductB2C' ? ProductB2C : ProductB2B;
  const product = await ProductModel.findById(product_id);
  if (!product || product.verification_status?.status !== 'approved') {
    throw new APIError('Product not found or not approved', StatusCodes.NOT_FOUND);
  }

  let wishlist = await Wishlist.findOne({ user: req.user.id });
  if (!wishlist) {
    wishlist = new Wishlist({ user: req.user.id, items: [] });
  }

  if (wishlist.items.some(item => item.product.toString() === product_id.toString() && item.product_type === product_type)) {
    throw new APIError('Product already in wishlist', StatusCodes.BAD_REQUEST);
  }

  wishlist.items.push({ product_type, product: product_id });
  await wishlist.save();

  logger.info(`Added product ${product_id} to wishlist for customer: ${customer.email}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Product added to wishlist',
    wishlist
  });
});

// Remove from Wishlist
exports.removeFromWishlist = asyncHandler(async (req, res, next) => {
  const { product_id, product_type } = req.params;
  if (!mongoose.Types.ObjectId.isValid(product_id)) {
    throw new APIError('Invalid product ID', StatusCodes.BAD_REQUEST);
  }
  if (!['ProductB2C', 'ProductB2B'].includes(product_type)) {
    throw new APIError('Invalid product type', StatusCodes.BAD_REQUEST);
  }

  const customer = await Customer.findById(req.user.id);
  if (!customer) {
    throw new APIError('Customer not found', StatusCodes.NOT_FOUND);
  }

  const wishlist = await Wishlist.findOne({ user: req.user.id });
  if (!wishlist) {
    throw new APIError('Wishlist not found', StatusCodes.NOT_FOUND);
  }

  const itemIndex = wishlist.items.findIndex(item => item.product.toString() === product_id && item.product_type === product_type);
  if (itemIndex < 0) {
    throw new APIError('Product not found in wishlist', StatusCodes.NOT_FOUND);
  }

  wishlist.items.splice(itemIndex, 1);
  await wishlist.save();

  logger.info(`Removed product ${product_id} from wishlist for customer: ${customer.email}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Product removed from wishlist',
    wishlist
  });
});

// Get Wishlist
exports.getWishlist = asyncHandler(async (req, res, next) => {
  const customer = await Customer.findById(req.user.id);
  if (!customer) {
    throw new APIError('Customer not found', StatusCodes.NOT_FOUND);
  }

  const wishlist = await Wishlist.findOne({ user: req.user.id })
    .populate({
      path: 'items.product',
      select: 'name pricing.sale_price pricing.bulk_pricing images',
      model: function(doc) {
        return doc.items.product_type === 'ProductB2C' ? ProductB2C : ProductB2B;
      }
    })
    .lean();

  if (!wishlist) {
    throw new APIError('Wishlist not found', StatusCodes.NOT_FOUND);
  }

  wishlist.items = wishlist.items.filter(item => item.product);

  logger.info(`Retrieved wishlist for customer: ${customer.email}`);
  res.status(StatusCodes.OK).json({
    success: true,
    wishlist
  });
});