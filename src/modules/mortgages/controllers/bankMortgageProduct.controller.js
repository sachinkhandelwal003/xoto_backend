const BankMortgageProduct = require("../models/BankProduct.js");

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
  getBankProductStats
};