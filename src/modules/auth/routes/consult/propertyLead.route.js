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
router.post('/create-mortgage-lead', controller.createMortgagePropertyLead);
router.post('/', controller.createPropertyLead);

router.use(protectMulti);

// ✅ Static routes FIRST — before any /:id routes
router.get('/my-leads', controller.getMyAssignedLeads);

// ✅ Then all /:id routes
router.get('/',    controller.getAllPropertyLeads);
router.get('/:id', validatePropertyLeadId, controller.getPropertyLead);

router.put('/:id',
  validatePropertyLeadId,
  validateUpdatePropertyLead,
  controller.updatePropertyLead
);

router.put('/:id/contacted',
  validatePropertyLeadId,
  controller.markAsContacted
);

router.delete('/:id',
  validatePropertyLeadId,
  controller.deletePropertyLead
);

router.get('/:id/suggest-advisors',
  validatePropertyLeadId,
  controller.suggestAdvisors
);

router.put('/:id/assign',
  validatePropertyLeadId,
  controller.assignAdvisor
);

// ✅ This was also after /:id before — now correctly placed
router.put('/:id/status',
  validatePropertyLeadId,
  controller.updateLeadStatus
);





module.exports = router;