const express = require('express');
const router = express.Router();
const vendorController = require('../../controllers/vendor/b2bvendor.controller');
const { protect, authorize ,protectVendorb2b} = require('../../../../middleware/auth');

const { checkPermission } = require('../../../../middleware/permission');
const upload = require('../../../../middleware/multer');
const {
  validateCreateVendor,
  validateVendorId,
  validateUpdateVendor,
  validateGetAllVendors,
  validateUpdateVendorStatus,
  validateUpdateDocumentVerification,
  validateVendorLogin,
  validateChangePassword,
  validateUpdateDocument
} = require('../../validations/vendor/vendorB2B.validation');

// Configure multer with file type and size restrictions
const uploadSingleFile = upload.single('file');
router.put(
  '/document/:documentId',
  protectVendorb2b,
  uploadSingleFile,
  validateUpdateDocument,
  vendorController.updateDocument
);
router.post('/login', validateVendorLogin, vendorController.vendorLogin);
router.get('/profile',protectVendorb2b,vendorController.getVendorProfile);
router.put(
  '/change-password',
  protectVendorb2b,
  validateChangePassword,
  vendorController.changePassword
);
router.get(
  '/',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Vendors', 'read'),
  validateGetAllVendors,
  vendorController.getAllVendors
);

router.post(
  '/',
upload.fields([
  { name: 'identityProof', maxCount: 1 },
  { name: 'addressProof', maxCount: 1 },
  { name: 'businessProof', maxCount: 1 },
  { name: 'gstCertificate', maxCount: 1 },
  { name: 'cancelledCheque', maxCount: 1 },
  { name: 'additional', maxCount: 10 },
      { name: 'logo', maxCount: 1 } 

]), 
  validateCreateVendor,
  vendorController.createVendor
);


router.put(
  '/:id',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Vendors', 'update'),
  validateVendorId,
  validateUpdateVendor,
  vendorController.updateVendor
);

router.delete(
  '/:id',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Vendors', 'delete'),
  validateVendorId,
  vendorController.deleteVendor
);

router.put(
  '/:id/status',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Vendors', 'update'),
  validateUpdateVendorStatus,
  vendorController.updateVendorStatus
);

router.put(
  '/change-password',
  protect,
  validateChangePassword,
  vendorController.changePassword
);

router.put(
  '/document/:documentId',
  protect,
  validateUpdateDocument,
  vendorController.updateDocument
);

router.put(
  '/document/verification/check',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Vendors', 'update'),
  validateUpdateDocumentVerification,
  vendorController.updateDocumentVerification
);

module.exports = router;