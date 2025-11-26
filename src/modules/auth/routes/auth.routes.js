const express = require('express');
const router = express.Router();
const userController = require('../controllers/auth.controller');
const otpController = require('../controllers/vendor/otp.controller');

const { protect, authorize } = require('../../../middleware/auth');
const { checkPermission } = require('../../../middleware/permission');
const {
  validateCreateUser,
  validateGetAllUsers,
  validateLogin
} = require('../validations/auth.validation');
const {
  validateSendOtp,
  validateVerifyOtp,
} = require('../validations/vendor/vendorB2C.validation');
/**
 * OTP Routes (public)
 */
router.post('/otp/send',validateSendOtp, otpController.sendOtp);
router.post('/otp/verify',validateVerifyOtp, otpController.verifyOtp);

/**
 * User Management Routes
 */

// Create user (SuperAdmin or roles with Admin module create permission)
router.post(
  '/',
  protect,
  authorize({ minLevel: 10 }), // SuperAdmin bypasses minLevel
  checkPermission('Users', 'create'), // SuperAdmin bypasses permission check
  validateCreateUser,
  userController.createUser
);

// Login (public route)
router.post('/login', validateLogin, userController.login);

// Get all users (SuperAdmin or roles with Admin module read permission)
router.get(
  '/',
  protect,
  authorize({ minLevel: 5 }), // SuperAdmin bypasses minLevel
  checkPermission('Users', 'read'), // SuperAdmin bypasses permission check
  validateGetAllUsers,
  userController.getAllUsers
);

// Get current logged-in user (any authenticated user)
router.get(
  '/me',
  protect,
  userController.getMe
);

module.exports = router;
