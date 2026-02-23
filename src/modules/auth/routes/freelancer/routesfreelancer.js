const router = require('express').Router();
const controller = require('../../controllers/freelancer/projectfreelancer.controller');

// Add this temporary route for debugging

// 🔹 FIX: Add protectMulti middleware
router.get('/getdata', controller.getProjectsByFreelancerId);



module.exports = router;