// routes/propertyLead/propertyLead.route.js
const express = require('express');
const router = express.Router();
const controller = require('../../controllers/consult/propertyLead.controller');
const { protectMulti, authorize } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');
const {
  validateCreatePropertyLead,
  validateUpdatePropertyLead,
  validateGetPropertyLeads,
  validatePropertyLeadId
} = require('../../validations/consult/propertyLead.validation');

// Public create
router.post('/', validateCreatePropertyLead, controller.createPropertyLead);
router.post('/create-mortgage-lead', controller.createMortgagePropertyLead);

// Protected
router.use(protectMulti);

// Get all
router.get('/',
  authorize({ roles: ['SuperAdmin', 'Admin', 'Manager'] }),
  checkPermission('PropertyLeads', 'view'),
  validateGetPropertyLeads,
  controller.getAllPropertyLeads
);

// Get single
router.get('/:id', validatePropertyLeadId, controller.getPropertyLead);


// Update
router.put('/:id',
  authorize({ roles: ['SuperAdmin', 'Admin', 'Manager'] }),
  validatePropertyLeadId,
  validateUpdatePropertyLead,
  controller.updatePropertyLead
);

// Mark contacted
router.put('/:id/contacted', validatePropertyLeadId, controller.markAsContacted);

// Delete
router.delete('/:id',
  authorize({ roles: ['SuperAdmin', 'Admin'] }),
  validatePropertyLeadId,
  controller.deletePropertyLead
);

module.exports = router;