// routes/freelancer/accountant.route.js
const express = require('express');
const router = express.Router();
const controller = require('../../controllers/accountant/Accountant.controller');
const { protect } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');
const {
  validateCreateAccountant,
  validateAccountantLogin,
  validateGetAllAccountants,
  validateAccountantId,
} = require('../../validations/accountant/Accountant.validation');

// PUBLIC
router.post('/login', validateAccountantLogin, controller.accountantLogin);
router.post('/', validateCreateAccountant, controller.createAccountant);

// ADMIN ONLY
router.use(protect, checkPermission('Accountants', 'view'));
router.get('/', validateGetAllAccountants, controller.getAllAccountants);
router.patch('/:id/toggle', validateAccountantId, controller.toggleAccountantActive);
router.delete('/:id', validateAccountantId, controller.deleteAccountant);

module.exports = router;