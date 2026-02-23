// routes/freelancer/invoice.route.js
const express = require('express');
const router = express.Router();
const controller = require('../../controllers/freelancer/invoice.controller');

const { validateGetInvoices, validateInvoiceId } = require('../../validations/freelancer/invoice.validation');
const { protectMulti, authorize } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');

router.get('/get/projects', controller.getProjects);

router.use(protectMulti, authorize({ roles: ['SuperAdmin', 'Admin', 'Freelancer', 'Customer'] }));
router.use(checkPermission('Freelancers', 'view', 'Invoices'));

// router.get('/', validateGetInvoices, controller.getInvoices);
router.post('/:id/pay', checkPermission('Freelancers', 'update', 'Invoices'), controller.payInvoice);

module.exports = router;