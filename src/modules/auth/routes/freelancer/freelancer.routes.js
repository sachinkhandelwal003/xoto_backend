// routes/freelancer.route.js
const express = require('express');
const router = express.Router();
const controller = require('../../controllers/freelancer/freeelancer.controller');
const { protect, protectFreelancer ,protectMulti } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');
const upload = require('../../../../middleware/multer');
const {
  validateCreateFreelancer,
  validateFreelancerLogin,
  validateGetAllFreelancers,
  validateUpdateFreelancerStatus,
  validateFreelancerId
} = require('../../validations/freelancer/freelancer.validation');

const docUpload = upload.fields([
  { name: 'resume', maxCount: 1 },
  { name: 'portfolio', maxCount: 1 },
  { name: 'certificates', maxCount: 10 },
  { name: 'identityProof', maxCount: 1 },
  { name: 'addressProof', maxCount: 1 }
]);

// PUBLIC
router.post('/login', validateFreelancerLogin, controller.freelancerLogin);

// FREELANCER
router.get('/profile', protectMulti, controller.getFreelancerProfile);
router.post('/', validateCreateFreelancer, controller.createFreelancer);
router.get('/', validateGetAllFreelancers, controller.getAllFreelancers);
router.put('/profile', docUpload, controller.updateFreelancerProfile);
router.put(
  '/document/:documentId',
  upload.single('file'), // single file
  controller.updateDocument
);
// ADMIN → ALL FREELANCERS SUBMODULE
router.use(protect, checkPermission('Freelancers', 'view', 'All Freelancers'));

router.put('/document/verification/check', controller.updateDocumentVerification);
router.put('/:id/status', checkPermission('Freelancers', 'update', 'All Freelancers'), validateFreelancerId, validateUpdateFreelancerStatus, controller.updateFreelancerStatus);
router.delete('/:id', checkPermission('Freelancers', 'delete', 'All Freelancers'), validateFreelancerId, controller.deleteFreelancer);


module.exports = router;