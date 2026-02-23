const express = require('express');
const router = express.Router();
const categoryController = require('../../controllers/products/category.controller');
const { protect, authorize } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');


router.get('/country', categoryController.getAllCategories);


module.exports = router;