// routes/consultant/consultant.route.js
const express = require('express');
const router = express.Router();
const controller = require('../../controllers/consult/consult.controller');
const { protectMulti,protect, authorize } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');
const {
  validateCreateConsultant,
  validateUpdateConsultant,
  validateGetConsultants,
  validateConsultantId,
} = require('../../validations/consult/consult.validation');

// ===================================================================
// CONSULTANT ROUTESsdgdsgsdgsdfgsdfg
// ===================================================================

// Public route for form submission (no auth required)
router.post('/', validateCreateConsultant, controller.createConsultant);

// Protect all other routes
router.use(protectMulti);

// GET ALL CONSULTANTS (protected)
router.get('/', 
  authorize({
    roles: ['SuperAdmin', 'Admin', 'Manager']
  }),
  checkPermission('Consultants', 'view', 'All Consultants'),
  validateGetConsultants,
  controller.getAllConsultants
);

// GET SINGLE CONSULTANT
router.get('/:id',
  authorize({
    roles: ['SuperAdmin', 'Admin', 'Manager']
  }),
  checkPermission('Consultants', 'view', 'All Consultants'),
  validateConsultantId,
  controller.getConsultant
);

// UPDATE CONSULTANT
router.put('/:id',
  authorize({
    roles: ['SuperAdmin', 'Admin', 'Manager']
  }),
  checkPermission('Consultants', 'update', 'All Consultants'),
  validateConsultantId,
  validateUpdateConsultant,
  controller.updateConsultant
);

// UPDATE STATUS ONLY
router.put('/:id/status',
 protectMulti,
  validateConsultantId,
  controller.updateConsultantStatus
);

// SOFT DELETE
router.delete('/:id',
  authorize({
    roles: ['SuperAdmin', 'Admin']
  }),
  checkPermission('Consultants', 'delete', 'All Consultants'),
  validateConsultantId,
  controller.deleteConsultant
);

// RESTORE
router.put('/:id/restore',
  authorize({
    roles: ['SuperAdmin', 'Admin']
  }),
  checkPermission('Consultants', 'delete', 'All Consultants'),
  validateConsultantId,
  controller.restoreConsultant
);

module.exports = router;