const express = require('express');
const ctrl = require('../controllers/adminAgreement.controller');
const { protectMulti, authorize } = require('../../../../middleware/auth');

const router = express.Router();

const adminOnly = authorize({ roles: ['admin', 'superadmin'] });

router.get('/my', protectMulti, ctrl.getMyAgreements);

router.use(protectMulti, adminOnly);

router.get('/upload-options', ctrl.getUploadOptions);
router.get('/', ctrl.getAgreements);
router.post('/', ctrl.createAgreement);
router.get('/:id', ctrl.getAgreementById);
router.patch('/:id', ctrl.updateAgreement);
router.delete('/:id', ctrl.archiveAgreement);

module.exports = router;
