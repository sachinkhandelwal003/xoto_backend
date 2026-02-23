const express = require('express');
const router = express.Router();
const cartOrderWishlistController = require('../controllers/products/cartOrderWishlist.controller');
const { protect, authorize } = require('../../../../middleware/auth');
const {
  validateCreateOrUpdateCart,
  validateRemoveCartItem,
  validateApplyCoupon,
  validateCreateOrder,
  validateCancelOrder,
  validateGetAllOrders,
  validateOrderId,
  validateAddToWishlist,
  validateRemoveFromWishlist
} = require('../validations/cartOrderWishlist.validation');

// Customer Routes
router.post(
  '/cart',
  validateCreateOrUpdateCart,
  cartOrderWishlistController.createOrUpdateCart
);

router.delete(
  '/cart/:product_id/:product_type',
  validateRemoveCartItem,
  cartOrderWishlistController.removeCartItem
);

router.get(
  '/cart',
  cartOrderWishlistController.getCart
);

router.post(
  '/cart/coupon',
  protect,
  authorize({ roles: ['Customer'] }),
  validateApplyCoupon,
  cartOrderWishlistController.applyCoupon
);

router.delete(
  '/cart/clear',
  protect,
  authorize({ roles: ['Customer'] }),
  cartOrderWishlistController.clearCart
);

router.post(
  '/orders',
  protect,
  authorize({ roles: ['Customer'] }),
  validateCreateOrder,
  cartOrderWishlistController.createOrder
);

router.get(
  '/orders/:id',
  protect,
  authorize({ roles: ['Customer'] }),
  validateOrderId,
  cartOrderWishlistController.getOrderById
);

router.get(
  '/orders',
  protect,
  authorize({ roles: ['Customer'] }),
  validateGetAllOrders,
  cartOrderWishlistController.getAllOrders
);

router.put(
  '/orders/:id/cancel',
  protect,
  authorize({ roles: ['Customer'] }),
  validateCancelOrder,
  cartOrderWishlistController.cancelOrder
);

router.post(
  '/wishlist',
  protect,
  authorize({ roles: ['Customer'] }),
  validateAddToWishlist,
  cartOrderWishlistController.addToWishlist
);

router.delete(
  '/wishlist/:product_id/:product_type',
  protect,
  authorize({ roles: ['Customer'] }),
  validateRemoveFromWishlist,
  cartOrderWishlistController.removeFromWishlist
);

router.get(
  '/wishlist',
  protect,
  authorize({ roles: ['Customer'] }),
  cartOrderWishlistController.getWishlist
);

module.exports = router;