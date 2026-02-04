const Router = require("express");
const { addToCart, createBrand, deleteProductById, getProductById, getAllProducts, createProducts, createCategory, getCategoryById, getAllBrands, getBrandByID, editBrandByID, editCategory, deleteCategoryByID, deleteBrandBYID, getAllCategory, updateProductById } = require("../controllers/index.js")
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
router.post("/delete-product-by-id", deleteProductById)
router.post("/edit-product-by-id", updateProductById)

router.post("/add-to-cart-by-customer", addToCart)
// router.post("/get-all-cart-products", getAllCartItems)
// router.post("/get-all-cartItems-by-customerId", getAllCartItemsByCartId)


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