const Router = require("express");
const { addToCart, PurchaseCartItems,getCartItems, removeFromCart, clearCart,  updateCartQuantity,  createBrand,addProductMargin, deleteProductById, getProductById, getAllProducts, createProducts, createCategory, getCategoryById, getAllBrands, getBrandByID, editBrandByID, editCategory, deleteCategoryByID, deleteBrandBYID, getAllCategory, updateProductById } = require("../controllers/index.js")
const {
  cashOnDelivery,
  createTabbySession,
  createTamaraSession,
  paymentSuccess,
} = require("../controllers/payment.controller.js")
const { protectCustomer } = require("../../../middleware/auth.js");
const router = Router();


//brand
router.post("/create-brand", createBrand)
router.post("/edit-brand-by-id", editBrandByID)
router.post("/delete-brand-by-id", deleteBrandBYID)
router.get("/get-all-brand", getAllBrands)
router.get("/get-brand-by-id", getBrandByID)

//category
router.post("/create-category", createCategory)
router.post("/edit-category-by-id", editCategory)
router.post("/delete-category-by-id", deleteCategoryByID)
router.get("/get-all-category", getAllCategory)
router.get("/get-category-by-id", getCategoryById)


//products
router.post("/create-products", createProducts)
router.get("/get-all-products", getAllProducts)
router.get("/get-product-by-id", getProductById)
router.post("/add-margin-products",addProductMargin);

router.post("/delete-product-by-id", deleteProductById)
router.post("/edit-product-by-id", updateProductById)

router.post('/cart/add', protectCustomer, addToCart);
router.get('/cart/get', protectCustomer, getCartItems);
router.delete('/cart/remove', protectCustomer, removeFromCart);
router.put('/cart/update', protectCustomer, updateCartQuantity);
router.delete('/cart/clear', protectCustomer, clearCart);
router.post('/cart/purchase', protectCustomer, PurchaseCartItems);
// router.post("/get-all-cartItems-by-customerId", getAllCartItemsByCartId)

// Payment routes
router.post("/cart/cod", protectCustomer, cashOnDelivery);
router.post("/cart/tabby-session", protectCustomer, createTabbySession);
router.post("/cart/tamara-session", protectCustomer, createTamaraSession);
router.get("/cart/payment/success", paymentSuccess);



// router.get("/get-all-category", getAllCategory)
// router.get("/get-category-by-id", getCategoryById)

// router.post("/create-properties", createProperty)
// router.post("/delete-property", deleteProperty)
// router.post("/edit-property", editProperty)
// router.get("/get-all-properties", getAllProperties)
// router.get("/get-property-by-id", getPropertiesById)
// router.get("/marketplace", MarketPlaceAPI)
// router.get("/get-all-developers", getAllDevelopers)
// router.post("/delete-developer-by-id", deleteDeveloper)
// router.get("/get-developer-by-id", getDeveloperrById)
// router.get("/get-property-by-id", getPropertyById)
// router.post("/edit-developer", editDeveloper)

module.exports = router; 