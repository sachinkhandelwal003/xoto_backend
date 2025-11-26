// routes/business/business.route.js

const express = require('express');
const router = express.Router();
const businessController = require('../../controllers/freelancer/freelancerbusiness.controller');
const { protect, authorize, protectBusiness } = require('../../../../middleware/auth'); // Assuming protectBusiness is similar to protectVendorb2c
const { checkPermission } = require('../../../../middleware/permission');
const upload = require('../../../../middleware/multer');
const {
  validateCreateBusiness,
  validateBusinessId,
  validateUpdateBusiness,
  validateGetAllBusinesses,
  validateUpdateBusinessStatus,
  validateUpdateDocumentVerification,
  validateBusinessLogin,
  validateChangePassword,
  validateUpdateDocument
} = require('../../validations/freelancer/freelancerbusiness.validation');

// Configure multer with file type and size restrictions
const uploadSingleFile = upload.single('file');

router.post('/login', validateBusinessLogin, businessController.businessLogin);

router.get('/profile', protectBusiness, businessController.getBusinessProfile);

router.put(
  '/change-password',
  protectBusiness,
  validateChangePassword,
  businessController.changePassword
);

router.put(
  '/document/:documentId',
  protectBusiness,
  uploadSingleFile,
  validateUpdateDocument,
  businessController.updateDocument
);

router.get(
  '/',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Businesses', 'read'),
  validateGetAllBusinesses,
  businessController.getAllBusinesses
);

router.post(
  '/',
  upload.fields([
    { name: 'identityProof', maxCount: 1 },
    { name: 'addressProof', maxCount: 1 },
    { name: 'gstCertificate', maxCount: 1 },
    { name: 'businessLicense', maxCount: 1 },
    { name: 'logo', maxCount: 1 }
  ]),
  validateCreateBusiness,
  businessController.createBusiness
);

router.put(
  '/:id',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Businesses', 'update'),
  validateBusinessId,
  validateUpdateBusiness,
  businessController.updateBusiness
);

router.delete(
  '/:id',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Businesses', 'delete'),
  validateBusinessId,
  businessController.deleteBusiness
);

router.put(
  '/:id/status',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Businesses', 'update'),
  validateUpdateBusinessStatus,
  businessController.updateBusinessStatus
);

router.put(
  '/document/verification/check',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Businesses', 'update'),
  validateUpdateDocumentVerification,
  businessController.updateDocumentVerification
);

module.exports = router;