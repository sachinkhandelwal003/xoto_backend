const BankMortgageProduct = require("../models/BankProduct.js");
const BankForm = require("../models/Bankproductdocuments.js");


// ==================== CREATE BANK PRODUCT ====================
const createBankProducts = async (req, res) => {
  try {
    const bankProduct = await BankMortgageProduct.create(req.body);

    return res.status(201).json({
      success: true,
      message: "Bank Product created successfully",
      data: bankProduct
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const errorMessages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation Error",
        errors: errorMessages
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


const createBankForm = async (req, res) => {
  try {
    const {
      bankProductId,
      formName,
      formType,
      formCategory,
      documentSource,        // NEW: "Customer" or "Bank"
      actionType,            // NEW: "direct_upload" or "download_fill_upload"
      fileUrl,
      fileName,
      fileSize,
      applicableEmploymentTypes,
      applicableResidencyStatus,
      applicableLoanTypes,
      isMandatory,
      requiresSignature,
      order,
      description,
      fillInstructions
    } = req.body;

    // Check if bank product exists
    const bankProduct = await BankMortgageProduct.findById(bankProductId);
    if (!bankProduct) {
      return res.status(404).json({
        success: false,
        message: "Bank product not found"
      });
    }

    // Check if form with same name already exists for this bank
    const existingForm = await BankForm.findOne({
      bankProductId: bankProductId,
      formName: formName,
      isLatestVersion: true,
      isArchived: false
    });

    let version = "1.0";
    let previousVersionId = null;

    if (existingForm) {
      const versionParts = existingForm.version.split(".");
      version = `${versionParts[0]}.${parseInt(versionParts[1]) + 1}`;
      previousVersionId = existingForm._id;
      existingForm.isLatestVersion = false;
      await existingForm.save();
    }

    const bankForm = await BankForm.create({
      bankProductId,
      bankName: bankProduct.bankInfo.bankName,
      bankCode: bankProduct.bankInfo.bankCode,
      formName,
      formType,
      formCategory: formCategory || "General",
      documentSource: documentSource || "Customer",  // NEW
      actionType: actionType || "direct_upload",     // NEW
      fileUrl: fileUrl || "",
      fileName: fileName || "",
      fileSize: fileSize || 0,
      version,
      previousVersionId,
      applicableEmploymentTypes: applicableEmploymentTypes || ["Both"],
      applicableResidencyStatus: applicableResidencyStatus || ["All"],
      applicableLoanTypes: applicableLoanTypes || ["Both"],
      isMandatory: isMandatory || false,
      requiresSignature: requiresSignature || false,
      order: order || 0,
      description: description || "",
      fillInstructions: fillInstructions || "",
      uploadedBy: req.user.id
    });

    return res.status(201).json({
      success: true,
      message: "Bank form created successfully",
      data: bankForm
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const errorMessages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation Error",
        errors: errorMessages
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
const createBulkBankForms = async (req, res) => {
  try {
    const { forms } = req.body;
    
    if (!forms || !Array.isArray(forms) || forms.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide an array of forms"
      });
    }

    // Check if bank product exists
    const bankProduct = await BankMortgageProduct.findById(forms[0].bankProductId);
    if (!bankProduct) {
      return res.status(404).json({
        success: false,
        message: "Bank product not found"
      });
    }

    const results = [];
    const errors = [];

    for (const formData of forms) {
      try {
        // Check if form already exists
        const existingForm = await BankForm.findOne({
          bankProductId: formData.bankProductId,
          formName: formData.formName,
          isLatestVersion: true,
          isArchived: false
        });

        let version = "1.0";
        let previousVersionId = null;

        if (existingForm) {
          const versionParts = existingForm.version.split(".");
          version = `${versionParts[0]}.${parseInt(versionParts[1]) + 1}`;
          previousVersionId = existingForm._id;
          existingForm.isLatestVersion = false;
          await existingForm.save();
        }

        const bankForm = await BankForm.create({
          bankProductId: formData.bankProductId,
          bankName: bankProduct.bankInfo.bankName,
          bankCode: bankProduct.bankInfo.bankCode,
          formName: formData.formName,
          formType: formData.formType,
          formCategory: formData.formCategory || "General",
          documentSource: formData.documentSource || "Customer",
          actionType: formData.actionType || "direct_upload",
          fileUrl: formData.fileUrl || "",
          fileName: formData.fileName || "",
          fileSize: formData.fileSize || 0,
          version,
          previousVersionId,
          applicableEmploymentTypes: formData.applicableEmploymentTypes || ["Both"],
          applicableResidencyStatus: formData.applicableResidencyStatus || ["All"],
          applicableLoanTypes: formData.applicableLoanTypes || ["Both"],
          isMandatory: formData.isMandatory || false,
          requiresSignature: formData.requiresSignature || false,
          order: formData.order || 0,
          description: formData.description || "",
          fillInstructions: formData.fillInstructions || "",
          uploadedBy: req.user.id
        });

        results.push(bankForm);
      } catch (err) {
        errors.push({ formName: formData.formName, error: err.message });
      }
    }

    return res.status(201).json({
      success: true,
      message: `${results.length} forms created successfully`,
      data: results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==================== GET ALL BANK FORMS ====================
const getAllBankForms = async (req, res) => {
  try {
    const {
      bankProductId,
      bankName,
      formType,
      isMandatory,
      isActive,
      page = 1,
      limit = 50
    } = req.query;

    let query = { isLatestVersion: true };

    if (bankProductId) query.bankProductId = bankProductId;
    if (bankName) query.bankName = bankName;
    if (formType) query.formType = formType;
    if (isMandatory === "true") query.isMandatory = true;
    if (isActive === "true") query.isActive = true;
    if (isActive === "false") query.isActive = false;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const forms = await BankForm.find(query)
      .populate("bankProductId", "bankInfo.bankName offerSummary.title")
      .sort({ order: 1, formName: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await BankForm.countDocuments(query);

    return res.status(200).json({
      success: true,
      message: "Bank forms fetched successfully",
      data: forms,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==================== GET FORMS BY BANK PRODUCT ID ====================
// ==================== GET FORMS BY BANK PRODUCT ID ====================
const getFormsByBankProduct = async (req, res) => {
  try {
    const { bankProductId } = req.params;
    const { 
      employmentType, 
      residencyStatus, 
      loanType,
      documentSource,      // "Customer" or "Bank"
      actionType,          // "direct_upload" or "download_fill_upload"
      formType,            // "customer_document", "application_form", etc.
      formCategory,        // "Pre-Approval", "Final Approval", "Disbursement", "General"
      isMandatory,         // true or false
      isActive,            // true or false
      search,              // search by formName
      page = 1,
      limit = 50,
      sortBy = "order",
      sortOrder = "asc"
    } = req.query;

    // Check if bank product exists
    const bankProduct = await BankMortgageProduct.findById(bankProductId);
    if (!bankProduct) {
      return res.status(404).json({
        success: false,
        message: "Bank product not found"
      });
    }

    // Build query
    let query = {
      bankProductId: bankProductId,
      isActive: true,
      isArchived: false,
      isLatestVersion: true
    };

    // Add filters if provided
    if (documentSource) {
      query.documentSource = documentSource;
    }
    
    if (actionType) {
      query.actionType = actionType;
    }
    
    if (formType) {
      query.formType = formType;
    }
    
    if (formCategory) {
      query.formCategory = formCategory;
    }
    
    if (isMandatory === 'true') {
      query.isMandatory = true;
    } else if (isMandatory === 'false') {
      query.isMandatory = false;
    }
    
    if (isActive === 'false') {
      query.isActive = false;
    }
    
    if (search) {
      query.formName = { $regex: search, $options: 'i' };
    }

    // Get forms based on customer profile (if provided)
    let forms;
    let total;
    
    if (employmentType && residencyStatus) {
      // Use static method for profile-based filtering
      forms = await BankForm.getFormsForBank(
        bankProductId,
        employmentType,
        residencyStatus,
        loanType
      );
      total = forms.length;
      
      // Apply additional filters to the result
      let filteredForms = forms;
      if (documentSource) {
        filteredForms = filteredForms.filter(f => f.documentSource === documentSource);
      }
      if (actionType) {
        filteredForms = filteredForms.filter(f => f.actionType === actionType);
      }
      if (formType) {
        filteredForms = filteredForms.filter(f => f.formType === formType);
      }
      if (formCategory) {
        filteredForms = filteredForms.filter(f => f.formCategory === formCategory);
      }
      if (isMandatory === 'true') {
        filteredForms = filteredForms.filter(f => f.isMandatory === true);
      } else if (isMandatory === 'false') {
        filteredForms = filteredForms.filter(f => f.isMandatory === false);
      }
      if (search) {
        filteredForms = filteredForms.filter(f => f.formName.toLowerCase().includes(search.toLowerCase()));
      }
      
      forms = filteredForms;
      total = forms.length;
    } else {
      // Regular query with pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      // Build sort object
      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;
      
      forms = await BankForm.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit));
      
      total = await BankForm.countDocuments(query);
    }

    // Separate mandatory and optional forms
    const mandatoryForms = forms.filter(form => form.isMandatory === true);
    const optionalForms = forms.filter(form => form.isMandatory === false);
    
    // Separate by document source
    const customerDocs = forms.filter(form => form.documentSource === "Customer");
    const bankForms = forms.filter(form => form.documentSource === "Bank");
    
    // Separate by action type
    const directUpload = forms.filter(form => form.actionType === "direct_upload");
    const downloadFillUpload = forms.filter(form => form.actionType === "download_fill_upload");

    return res.status(200).json({
      success: true,
      message: "Bank forms fetched successfully",
      data: {
        bankProduct: {
          id: bankProduct._id,
          name: bankProduct.bankInfo.bankName,
          productTitle: bankProduct.offerSummary.title,
          bankCode: bankProduct.bankInfo.bankCode,
          logo: bankProduct.bankInfo.logo
        },
        summary: {
          totalForms: total,
          mandatoryCount: mandatoryForms.length,
          optionalCount: optionalForms.length,
          customerDocsCount: customerDocs.length,
          bankFormsCount: bankForms.length,
          directUploadCount: directUpload.length,
          downloadFillUploadCount: downloadFillUpload.length
        },
        filters: {
          employmentType: employmentType || null,
          residencyStatus: residencyStatus || null,
          loanType: loanType || null,
          documentSource: documentSource || null,
          actionType: actionType || null,
          formType: formType || null,
          formCategory: formCategory || null,
          isMandatory: isMandatory || null,
          search: search || null
        },
        pagination: employmentType && residencyStatus ? null : {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total,
          totalPages: Math.ceil(total / parseInt(limit))
        },
        allForms: forms,
        mandatoryForms: mandatoryForms,
        optionalForms: optionalForms,
        customerDocuments: customerDocs,
        bankForms: bankForms,
        directUploadDocuments: directUpload,
        downloadFillUploadDocuments: downloadFillUpload
      }
    });
  } catch (error) {
    console.error('Get forms error:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==================== RECORD FORM DOWNLOAD ====================
const recordFormDownload = async (req, res) => {
  try {
    const { formId } = req.params;
    const { applicationId } = req.body;
    const userId = req.user.id;
    const userType = req.user.role; // Partner, Advisor, Ops, Admin

    const form = await BankForm.findById(formId);
    if (!form) {
      return res.status(404).json({
        success: false,
        message: "Bank form not found"
      });
    }

    await form.recordDownload(userId, userType, applicationId);

    return res.status(200).json({
      success: true,
      message: "Download recorded successfully",
      data: {
        downloadCount: form.downloadCount,
        lastDownloadedAt: form.lastDownloadedAt
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==================== UPDATE BANK FORM ====================
const updateBankForm = async (req, res) => {
  try {
    const { formId } = req.params;
    const updateData = req.body;
    updateData.updatedBy = req.user.id;

    const form = await BankForm.findByIdAndUpdate(
      formId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!form) {
      return res.status(404).json({
        success: false,
        message: "Bank form not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Bank form updated successfully",
      data: form
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==================== ARCHIVE BANK FORM ====================
const archiveBankForm = async (req, res) => {
  try {
    const { formId } = req.params;

    const form = await BankForm.findByIdAndUpdate(
      formId,
      {
        isActive: false,
        isArchived: true,
        archivedAt: new Date(),
        archivedBy: req.user.id
      },
      { new: true }
    );

    if (!form) {
      return res.status(404).json({
        success: false,
        message: "Bank form not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Bank form archived successfully",
      data: form
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==================== CREATE MULTIPLE BANK PRODUCTS (Bulk) ====================
const createBulkBankProducts = async (req, res) => {
  try {
    const products = req.body;
    
    if (!Array.isArray(products)) {
      return res.status(400).json({
        success: false,
        message: "Request body must be an array of products"
      });
    }
    
    const createdProducts = await BankMortgageProduct.insertMany(products);
    
    return res.status(201).json({
      success: true,
      message: `${createdProducts.length} Bank Products created successfully`,
      data: createdProducts
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const errorMessages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation Error",
        errors: errorMessages
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==================== GET ALL BANK PRODUCTS ====================
const getAllBankProducts = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      bankName, 
      productType, 
      isPopular, 
      isFeatured,
      sortBy = "displayOrder",
      sortOrder = "asc"
    } = req.query;
    
    let query = { "meta.isActive": true };
    
    if (bankName) query["bankInfo.bankName"] = bankName;
    if (productType) query["offerSummary.productType"] = productType;
    if (isPopular === "true") query.isPopular = true;
    if (isFeatured === "true") query.isFeatured = true;
    
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const bankProducts = await BankMortgageProduct.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await BankMortgageProduct.countDocuments(query);
    
    const formattedProducts = bankProducts.map(product => ({
      id: product._id,
      ...product.toObject()
    }));
    
    return res.status(200).json({
      success: true,
      message: "Bank Products fetched successfully",
      data: formattedProducts,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==================== GET BANK PRODUCT BY ID ====================
const getBankProductById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const bankProduct = await BankMortgageProduct.findById(id);
    
    if (!bankProduct) {
      return res.status(404).json({
        success: false,
        message: "Bank Product not found"
      });
    }
    
    return res.status(200).json({
      success: true,
      message: "Bank Product fetched successfully",
      data: bankProduct
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==================== GET BEST RATES ====================
const getBestRates = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const bestRates = await BankMortgageProduct.find({ "meta.isActive": true })
      .sort({ "offerSummary.initialRate": 1, displayOrder: 1 })
      .limit(parseInt(limit));
    
    return res.status(200).json({
      success: true,
      message: "Best rates fetched successfully",
      data: bestRates
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==================== GET POPULAR PRODUCTS ====================
const getPopularProducts = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const popularProducts = await BankMortgageProduct.find({ 
      "meta.isActive": true, 
      isPopular: true 
    }).sort({ displayOrder: 1 }).limit(parseInt(limit));
    
    return res.status(200).json({
      success: true,
      message: "Popular products fetched successfully",
      data: popularProducts
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==================== GET FEATURED PRODUCTS ====================
const getFeaturedProducts = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const featuredProducts = await BankMortgageProduct.find({ 
      "meta.isActive": true, 
      isFeatured: true 
    }).sort({ displayOrder: 1 }).limit(parseInt(limit));
    
    return res.status(200).json({
      success: true,
      message: "Featured products fetched successfully",
      data: featuredProducts
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==================== GET ELIGIBLE PRODUCTS FOR CUSTOMER ====================
const getEligibleProducts = async (req, res) => {
  try {
    const { salary, loanAmount, nationality, age, employmentType } = req.query;
    
    const products = await BankMortgageProduct.find({ "meta.isActive": true });
    
    const eligibleProducts = [];
    for (const product of products) {
      const eligibility = product.isCustomerEligible({
        monthlySalary: salary ? parseInt(salary) : null,
        loanAmount: loanAmount ? parseInt(loanAmount) : null,
        nationality,
        age: age ? parseInt(age) : null,
        employmentType
      });
      
      if (eligibility.eligible) {
        eligibleProducts.push({
          product,
          eligibility
        });
      }
    }
    
    // Sort by initial rate
    eligibleProducts.sort((a, b) => a.product.offerSummary.initialRate - b.product.offerSummary.initialRate);
    
    return res.status(200).json({
      success: true,
      message: "Eligible products fetched successfully",
      data: eligibleProducts,
      totalEligible: eligibleProducts.length
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==================== GET PRODUCTS BY BANK ====================
const getProductsByBank = async (req, res) => {
  try {
    const { bankCode } = req.params;
    
    const products = await BankMortgageProduct.find({ 
      "bankInfo.bankCode": bankCode,
      "meta.isActive": true 
    }).sort({ displayOrder: 1 });
    
    return res.status(200).json({
      success: true,
      message: `Products for bank ${bankCode} fetched successfully`,
      data: products
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==================== UPDATE BANK PRODUCT ====================
const updateBankProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const bankProduct = await BankMortgageProduct.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    
    if (!bankProduct) {
      return res.status(404).json({
        success: false,
        message: "Bank Product not found"
      });
    }
    
    return res.status(200).json({
      success: true,
      message: "Bank Product updated successfully",
      data: bankProduct
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const errorMessages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation Error",
        errors: errorMessages
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==================== UPDATE RATE ONLY ====================
const updateBankProductRate = async (req, res) => {
  try {
    const { id } = req.params;
    const { newRate } = req.body;
    
    const bankProduct = await BankMortgageProduct.findById(id);
    
    if (!bankProduct) {
      return res.status(404).json({
        success: false,
        message: "Bank Product not found"
      });
    }
    
    const oldRate = bankProduct.offerSummary.initialRate;
    bankProduct.offerSummary.initialRate = newRate;
    bankProduct.offerSummary.comparisonRate = newRate + 0.5;
    await bankProduct.save();
    
    return res.status(200).json({
      success: true,
      message: `Rate updated from ${oldRate}% to ${newRate}%`,
      data: bankProduct
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==================== DELETE BANK PRODUCT (Soft Delete) ====================
const deleteBankProduct = async (req, res) => {
  try {
    const { id } = req.params;
    
    const bankProduct = await BankMortgageProduct.findByIdAndUpdate(
      id,
      { "meta.isActive": false, "meta.isDeleted": true },
      { new: true }
    );
    
    if (!bankProduct) {
      return res.status(404).json({
        success: false,
        message: "Bank Product not found"
      });
    }
    
    return res.status(200).json({
      success: true,
      message: "Bank Product deleted successfully"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==================== HARD DELETE BANK PRODUCT ====================
const hardDeleteBankProduct = async (req, res) => {
  try {
    const { id } = req.params;
    
    const bankProduct = await BankMortgageProduct.findByIdAndDelete(id);
    
    if (!bankProduct) {
      return res.status(404).json({
        success: false,
        message: "Bank Product not found"
      });
    }
    
    return res.status(200).json({
      success: true,
      message: "Bank Product permanently deleted"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==================== GET BANK PRODUCT STATS ====================
const getBankProductStats = async (req, res) => {
  try {
    const totalProducts = await BankMortgageProduct.countDocuments({ "meta.isActive": true });
    const popularCount = await BankMortgageProduct.countDocuments({ isPopular: true, "meta.isActive": true });
    const featuredCount = await BankMortgageProduct.countDocuments({ isFeatured: true, "meta.isActive": true });
    
    const banks = await BankMortgageProduct.distinct("bankInfo.bankName", { "meta.isActive": true });
    
    const productTypeStats = await BankMortgageProduct.aggregate([
      { $match: { "meta.isActive": true } },
      { $group: { _id: "$offerSummary.productType", count: { $sum: 1 } } }
    ]);
    
    const avgRate = await BankMortgageProduct.aggregate([
      { $match: { "meta.isActive": true } },
      { $group: { _id: null, avgRate: { $avg: "$offerSummary.initialRate" } } }
    ]);
    
    return res.status(200).json({
      success: true,
      data: {
        totalProducts,
        popularCount,
        featuredCount,
        totalBanks: banks.length,
        banks: banks,
        productTypeDistribution: productTypeStats,
        averageInterestRate: avgRate[0]?.avgRate?.toFixed(2) || 0
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  createBankProducts,
  createBulkBankProducts,
  getAllBankProducts,
  getBankProductById,
  getBestRates,
  getPopularProducts,
  getFeaturedProducts,
  getEligibleProducts,
  getProductsByBank,
  updateBankProduct,
  updateBankProductRate,
  deleteBankProduct,
  hardDeleteBankProduct,
  getBankProductStats,
    createBankForm,
  getAllBankForms,
  getFormsByBankProduct,
  recordFormDownload,
  updateBankForm,
  archiveBankForm,createBulkBankForms
};