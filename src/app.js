const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const createError = require('http-errors');
const logger = require('./config/logger');
const Skyimport = require('./modules/ImageEnhancer/Routes/SkyRoutes.js')
const virtualStagingRoutes = require('./modules/ImageEnhancer/Routes/VirtualRoutes.js');
const upload = require("../src/middleware/s3Upload.js").default
const { uploadFileToS3 } = require("./modules/s3/upload.js");
const {downloadImageAsPDF} =require("./modules/s3/downloadUpload.js")
const aiRoutes = require('./modules/Grid/Agent/routes/AIroutes.js');
const blogRoutes = require('../src/modules/blogs/routes/index.js').default;
const mortgageRoutes = require('./modules/mortgages/routes/index.js');
const bankMortgageProductRoutes = require('./modules/mortgages/routes/bankMortgageProduct.routes.js');
const agencyRoutes = require('./modules/Grid/agency/routes/index.js');
// const agencyRoutes = require('./modules/agency/routes/index.js');
const stripeRoutes = require('./modules/auth/routes/ai/Striperoutes.js');
const otpRoutes = require('../src/modules/otp/routes/index.js').default
const customer = require('../src/modules/customer/routes/index.js').default
const app = express();
const Notification = require("../src/modules/Notification/Routes/NotificationRoutes.js").default
const PropertyLead = require("./modules/auth/routes/consult/propertyLead.route").default
const ProfileData = require("./modules/profile/routes/index.js").default
const agentRoutes = require('./modules/Grid/Agent/routes/index.js');
const brochureRoutes = require('./modules/Grid/Agent/routes/brochureRoutes.js');
const customerHistoryRoutes = require('../src/modules/history/routes/customerHistory.routes.js');
const inventoryRoutes = require("./modules/ecommerce/B2C/routes/inventory.routes");
const GridAdvisor = require('./modules/Grid/Advisor/routes/index.js')
const AgentLead = require('./modules/Grid/Agent/routes/Agentroute.js')
// const stripeRoutes = require('./modules/auth/routes/ai/Striperoutes.js');
// const AgentLead = require('./modules/Agent/routes/Agentroute.js')
const enhancementRoutes = require('./modules/ImageEnhancer/Routes/ImageRoutes.js').default;
const referralPartnerRoutes = require("./modules/Grid/ReferralPartner/Routes/ReferralPartner.route.js");
const rentalProperrty = require('./modules/RentalProperties/routes/Rentproperty.routes.js')
// const Rentlead = require('./modules/RentalProperties/routes/Rentlead.routes.js')
// console.log("SkyRoutes Check:", SkyRoutes);

// const SkyRoutes = Skyimport.default || Skyimport;


// ==========================================
// ⚠️ FIX: Stripe Route Yahan Upar Move Kiya Hai 
// ==========================================


// app.use('/stripe/webhook', express.raw({ type: 'application/json' }));
// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));

// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));
// 👇 Isko isse replace karo
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// Database connection
require('./config/database');
// app.use('/uploads',express.static(path.join(__dirname, '..', 'uploads')));
// app.use('/stripe', stripeRoutes);
app.get('/test-stripe', (req, res) => {
  res.json({ message: 'Stripe routes working!' });
});
app.use('/uploads', express.static('uploads'));
app.use('/estimates', require('./modules/auth/routes/leads/estimate.routes'));
app.use('/customer', customer);
app.use('/ai', require('./modules/auth/routes/ai/gardenAI.routes'));
app.use('/property/lead', require('./modules/auth/routes/consult/propertyLead.route'));

app.use('/packages', require('./modules/auth/routes/packages/packages.routes'));
app.use('/estimate/master/category', require('./modules/auth/routes/estimateCategory/category.routes'));
app.use('/dashboard', require('./modules/auth/routes/dashboardview/dashboard.routes.js'));

app.use('/freelancer/projects', require('../src/modules/auth/routes/freelancer/projectfreelancer.route'));
app.use('/property', require('../src/modules/properties/routes/index.js'));
app.use('/developer', require('../src/modules/properties/routes/developer.routes.js'));  //for testing route
app.use('/properties', require('../src/modules/properties/routes/property.routes.js'));  //for testing route

app.use('/products', require('../src/modules/products/routes/index.js'));
app.use('/profile', ProfileData);
app.post("/upload", upload.single("file"), uploadFileToS3)
app.get("/download-pdf", downloadImageAsPDF)

app.use('/accountant', require('./modules/auth/routes/accountant/Accountant.routes'));
app.use('/users', require('./modules/auth/routes/user/user.routes'));
app.use('/consult', require('./modules/auth/routes/consult/consult.routes'));
app.use('/enquiry', require('./modules/auth/routes/consult/enquiry.routes'));
app.use('/agency', agencyRoutes);
app.use('/mortgages', mortgageRoutes);
app.use('/bank/products', bankMortgageProductRoutes);

app.use('/agent', agentRoutes);
app.use('/brochure', brochureRoutes);

app.use('/agent/lead', AgentLead);
app.use('/landing/lead', (req, res, next) => {
  console.log('request came on /landing/lead');
  next();
}, require('./modules/auth/routes/consult/LandingLead.route'));

app.use('/freelancer/projects/get', require('../src/modules/auth/routes/freelancer/routesfreelancer'));
app.use('/freelancer/category', require('../src/modules/auth/routes/freelancer/freelancercategory.routes'));
app.use('/freelancer/subcategory', require('../src/modules/auth/routes/freelancer/freelancersubcategory.routes'));

// Routes
app.use('/vault/partner', require('./modules/vault/routes/partner.routes.js'));
app.use('/vault/advisor', require('./modules/vault/routes/advisor.routes.js'));
app.use('/vault/ops', require('./modules/vault/routes/ops.routes.js'));

app.use('/vault/agent', require('./modules/vault/routes/agent.routes.js'));
app.use('/vault/lead', require('./modules/vault/routes/lead.routes.js'));
app.use('/vault/lead/proposals', require('./modules/vault/routes/proposal.routes.js'));
app.use('/vault/cases', require('./modules/vault/routes/case.routes.js'));
app.use('/vault/commissions', require('./modules/vault/routes/commission.routes.js'));

app.use('/vault/lead/documents', require('./modules/vault/routes/document.routes.js'));
// Grid Referral Partner 
app.use("/referral", referralPartnerRoutes);

app.use('/platform', require('../src/modules/auth/routes/role/platform.routes'));

app.use('/ecommerce/v1', require('../src/modules/ecommerce/B2C/routes/cartOrderWishlist.route'));
app.use('/roles', require('../src/modules/auth/routes/role/role.routes'));
app.use('/permission', require('../src/modules/auth/routes/permission/permission.routes'));
app.use('/permission-action', require('../src/modules/auth/routes/permission/action.routes'));
app.use('/module', require('../src/modules/auth/routes/module/module.routes'));
app.use('/setting/tax', require('../src/modules/auth/routes/tax/tax.routes'));
app.use('/setting/currency', require('../src/modules/auth/routes/currency/currency.routes'));
app.use("/inventory", inventoryRoutes);
app.use('/auth', require('../src/modules/auth/routes/auth.routes'));
app.use('/vendor', require('../src/modules/auth/routes/vendor/vendorb2c.routes'));
app.use('/vendor/b2b', require('../src/modules/auth/routes/vendor/vendorb2b.routes'));
app.use('/business', require('../src/modules/auth/routes/freelancer/freelancerbusiness.routes'));

app.use('/gridadvisor', GridAdvisor);
// RentalProperty
app.use('/rental/property', rentalProperrty)
// app.use('/rental/lead', Rentlead)

// image ehncnace,ent 
app.use('/ai/enhance', enhancementRoutes);
// sky replacement

app.use('/ai/sky-replacement', Skyimport);
// landscapping freelacer
app.use('/ai/virtual-staging', virtualStagingRoutes);
app.use('/freelancer', require('../src/modules/auth/routes/freelancer/freelancer.routes'));


app.use('/freelancer/projects/invoice', require('../src/modules/auth/routes/freelancer/invoice.route'));
app.use('/otp', otpRoutes);
// agent AI features
app.use('/aiii', aiRoutes);
// ⚠️ Stripe route yahan se hata diya gaya hai, line number 36 pe daal diya gaya hai.
app.use('/attributes', require('../src/modules/ecommerce/B2C/routes/attribute.routes'));
app.use('/materials', require('../src/modules/ecommerce/B2C/routes/material.routes'));
app.use('/brands', require('../src/modules/ecommerce/B2C/routes/brand.routes'));


app.use('/categories', require('../src/modules/ecommerce/B2C/routes/category.routes'));
app.use('/tags', require('../src/modules/ecommerce/B2C/routes/tags.routes'));
app.use('/blogs', blogRoutes);
app.use('/vendor/warehouses', require('../src/modules/ecommerce/B2C/routes/warehouse.routes'));

// History
app.use('/customer-history', customerHistoryRoutes);


// notifications
app.use('/notifications', Notification);
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