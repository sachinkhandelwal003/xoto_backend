const express = require('express');
const router = express.Router();
const vendorController = require('../../controllers/vendor/b2cvendor.controller');
const { protect, authorize, protectVendorb2c } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');
const upload = require('../../../../middleware/multer');
const {
  validateVendorId,
  validateUpdateVendor,
  validateGetAllVendors,
  validateUpdateVendorStatus,
  validateUpdateDocumentVerification,
  validateVendorLogin,
  validateChangePassword,
  validateUpdateDocument
} = require('../../validations/vendor/vendorB2C.validation');

// Configure multer with file type and size restrictions
const uploadSingleFile = upload.single('file');

router.post('/login', validateVendorLogin, vendorController.vendorLogin);

router.get('/profile', protectVendorb2c, vendorController.getVendorProfile);

router.put(
  '/change-password',
  protectVendorb2c,
  validateChangePassword,
  vendorController.changePassword
);

router.put(
  '/document/:documentId',
  protectVendorb2c,
  uploadSingleFile,
  validateUpdateDocument,
  vendorController.updateDocument
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
  '/register',
  vendorController.createVendor
);

router.put(
  '/profile/update',
  protectVendorb2c,
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "identity_proof", maxCount: 1 },
    { name: "address_proof", maxCount: 1 },
    { name: "gst_certificate", maxCount: 1 },
    { name: "cancelled_cheque", maxCount: 1 },
    { name: "shop_act_license", maxCount: 1 },
        { name: "pan_card", maxCount: 1 }

  ]),
  vendorController.updateVendorProfile
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
  vendorController.updateVendorStatus
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