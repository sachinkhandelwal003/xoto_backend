// routes/enquiry/enquiry.route.js
const express = require('express');
const router = express.Router();
const controller = require('../../controllers/consult/enquiry.controller');
const { protectMulti, authorize } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');
const {
  validateCreateEnquiry,
  validateUpdateEnquiry,
  validateGetEnquiries,
  validateEnquiryId
} = require('../../validations/consult/enquiry.validation');

// PUBLIC: Submit enquiry form (no login needed)
router.post('/', validateCreateEnquiry, controller.createEnquiry);

// PROTECTED ROUTES
router.use(protectMulti);

// Get all enquiries
router.get('/', 
  authorize({ roles: ['SuperAdmin', 'Admin', 'Manager', 'Sales'] }),
  checkPermission('Enquiries', 'view'),
  validateGetEnquiries,
  controller.getAllEnquiries
);

// Get single
router.get('/:id', validateEnquiryId, controller.getEnquiry);

// Update (full)
router.put('/:id', 
  authorize({ roles: ['SuperAdmin', 'Admin', 'Manager'] }),
  validateEnquiryId,
  validateUpdateEnquiry,
  controller.updateEnquiry
);

// Quick: Mark as Contacted
router.put('/:id/contacted', validateEnquiryId, controller.markAsContacted);

// Soft Delete
router.delete('/:id', 
  authorize({ roles: ['SuperAdmin', 'Admin'] }),
  validateEnquiryId,
  controller.deleteEnquiry
);

module.exports = router;