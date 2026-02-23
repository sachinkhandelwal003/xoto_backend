// routes/user/user.route.js
const express = require('express');
const router = express.Router();
const controller = require('../../controllers/user/user.controller');
const { protect, protectMulti } = require('../../../../middleware/auth');
const {
  validateCreateUser,
  validateLogin,
  validateGetUsers,
  validateUserId,validateCustomerSignup 
} = require('../../validations/user/user.validation');

// Public routes
router.post('/login', validateLogin, controller.userLogin);
router.post('/login/customer', controller.customerLogin);

router.post(
  '/signup/customer',
  // validateCustomerSignup,
  controller.customerSignup
);

router.post('/register', controller.createUser);

// Protected routes
router.use(protectMulti);

router.get('/', controller.getAllUsers);
router.put('/:id/toggle', validateUserId, controller.toggleStatus);
router.delete('/:id', validateUserId, controller.softDelete);
router.put('/:id/restore', validateUserId, controller.restoreUser);
module.exports = router;