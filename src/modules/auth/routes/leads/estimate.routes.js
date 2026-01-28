// routes/estimate.routes.js

const router = require('express').Router();
const controller = require('../../controllers/leads/estimate.controller');

const { 
  protect,
  protectMulti,
  protectSupervisor,
  protectFreelancer,
  authorize, 
  protectCustomer
} = require('../../../../middleware/auth');

const validator = require('../../validations/leads/estimate.validation');


// ------------------------------------------------------------
// 1. CUSTOMER — SUBMIT ESTIMATE (Public)
// ------------------------------------------------------------
router.post(
  '/submit',
  controller.submitEstimate
);

router.get('/quatation', protectMulti, controller.getQuotations); // we need to change this 
router.get('/customer/my-estimates', protectMulti, controller.getCustomerEstimates);

router.get('/customer/estimate/:id/quotation', protectMulti, controller.getCustomerQuotation);

// ------------------------------------------------------------
// 2. SUPERADMIN — ASSIGN TO SUPERVISOR
// ------------------------------------------------------------
router.put(
  '/:id/assign-supervisor',
  protect,                               // user must be logged in
  authorize({ roles: ['superadmin'] }),  // only superadmin
  validator.validateAssignSupervisor,
  controller.assignToSupervisor
);

router.put(
  '/supervisor-quotation/approved-by-superadmin',
  protect,                               // user must be logged in
  authorize({ roles: ['superadmin'] }),  // only superadmin
  controller.approvedBySuperAdmin
);


// ------------------------------------------------------------
// GET ALL / SINGLE ESTIMATES (Admin/Supervisor/Superadmin)
// ------------------------------------------------------------
router.get(
  '/',
  protectMulti,  // login required
  controller.getEstimates
);


// ------------------------------------------------------------
// 3. SUPERVISOR — SEND REQUEST TO FREELANCERS
// ------------------------------------------------------------
router.put(
  '/:id/send-to-freelancers',
  protectSupervisor,                     // ensures supervisor role
  validator.validateSendToFreelancers,
  controller.sendToFreelancers
);


// ------------------------------------------------------------
// 4. FREELANCER — SUBMIT QUOTATION
// ------------------------------------------------------------
router.post(
  '/:id/quotation',
  protectFreelancer,
  // authorize({ roles: ['freelancer'] }),
  controller.submitQuotation
);


// ------------------------------------------------------------
// 5. SUPERVISOR — CREATE FINAL QUOTATION
// ------------------------------------------------------------
router.post(
  '/:id/final-quotation',
protectSupervisor,
  controller.createFinalQuotation
);


// ------------------------------------------------------------
// 6. SUPERADMIN — APPROVE FINAL QUOTATION
// ------------------------------------------------------------
router.put(
  '/:id/approve-quotation',
protect,  validator.validateApproveFinalQuotation,
  controller.approveFinalQuotation
);


// ------------------------------------------------------------
// 7. CUSTOMER — ACCEPT / REJECT
// ------------------------------------------------------------
router.put(
  '/:id/response',
  protectCustomer,
  validator.validateCustomerResponse,
  controller.customerResponse
);
router.post(
  '/:id/convert-to-deal',
  protectMulti,
  authorize({ roles: ['superadmin', 'admin'] }),
  controller.convertToDeal
);


module.exports = router;
