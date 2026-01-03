const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const createError = require('http-errors');
const logger = require('./config/logger');
const upload = require("../src/middleware/s3Upload.js").default
const { uploadFileToS3 } = require("./modules/s3/upload.js");


const app = express();

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection
require('./config/database');
// app.use('/uploads',express.static(path.join(__dirname, '..', 'uploads')));
app.use('/estimates', require('./modules/auth/routes/leads/estimate.routes'));
app.use('/ai', require('./modules/auth/routes/ai/gardenAI.routes'));
app.use('/packages', require('./modules/auth/routes/packages/packages.routes'));
app.use('/estimate/master/category', require('./modules/auth/routes/estimateCategory/category.routes'));

app.use('/freelancer/projects', require('../src/modules/auth/routes/freelancer/projectfreelancer.route'));
app.use('/property', require('../src/modules/properties/routes/index.js'));
app.post("/upload",upload.single("file"),uploadFileToS3) 
app.use('/accountant', require('./modules/auth/routes/accountant/Accountant.routes'));
app.use('/users', require('./modules/auth/routes/user/user.routes'));
app.use('/consult', require('./modules/auth/routes/consult/consult.routes'));
app.use('/enquiry', require('./modules/auth/routes/consult/enquiry.routes'));
app.use('/property/lead', require('./modules/auth/routes/consult/propertyLead.route'));
app.use('/landing/lead',  (req, res, next) => {
    console.log('request came on /landing/lead');
    next();
  },require('./modules/auth/routes/consult/LandingLead.route'));

app.use('/freelancer/projects/get', require('../src/modules/auth/routes/freelancer/routesfreelancer'));
app.use('/freelancer/category', require('../src/modules/auth/routes/freelancer/freelancercategory.routes'));
app.use('/freelancer/subcategory', require('../src/modules/auth/routes/freelancer/freelancersubcategory.routes'));

// Routes
app.use('/platform', require('../src/modules/auth/routes/role/platform.routes'));
app.use('/ecommerce/v1', require('../src/modules/ecommerce/B2C/routes/cartOrderWishlist.route'));
app.use('/roles', require('../src/modules/auth/routes/role/role.routes'));
app.use('/permission', require('../src/modules/auth/routes/permission/permission.routes'));
app.use('/permission-action', require('../src/modules/auth/routes/permission/action.routes'));
app.use('/module', require('../src/modules/auth/routes/module/module.routes'));
app.use('/setting/tax', require('../src/modules/auth/routes/tax/tax.routes'));
app.use('/setting/currency', require('../src/modules/auth/routes/currency/currency.routes'));

app.use('/auth', require('../src/modules/auth/routes/auth.routes'));
app.use('/vendor/b2c', require('../src/modules/auth/routes/vendor/vendorb2c.routes'));
app.use('/vendor/b2b', require('../src/modules/auth/routes/vendor/vendorb2b.routes'));
app.use('/business', require('../src/modules/auth/routes/freelancer/freelancerbusiness.routes'));


// landscapping freelacer

app.use('/freelancer', require('../src/modules/auth/routes/freelancer/freelancer.routes'));


app.use('/freelancer/projects/invoice', require('../src/modules/auth/routes/freelancer/invoice.route'));

app.use('/attributes', require('../src/modules/ecommerce/B2C/routes/attribute.routes'));
app.use('/materials', require('../src/modules/ecommerce/B2C/routes/material.routes'));
app.use('/brands', require('../src/modules/ecommerce/B2C/routes/brand.routes'));

app.use('/categories', require('../src/modules/ecommerce/B2C/routes/category.routes'));
app.use('/tags', require('../src/modules/ecommerce/B2C/routes/tags.routes'));
app.use('/products', require('../src/modules/ecommerce/B2C/routes/product.routes'));
app.use('/vendor/warehouses', require('../src/modules/ecommerce/B2C/routes/warehouse.routes'));

// 404 Handler
app.use((req, res, next) => {
  next(createError.NotFound());
});

// Error Handler
app.use((err, req, res, next) => {
  res.status(err.status || 500);
  res.json({
    error: {
      status: err.status || 500,
      message: err.message
    }
  });
});

module.exports = app;