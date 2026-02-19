import express from "express";
import multer from "multer";

// ✅ AUTH (NO CHANGE NEEDED IN auth.js)
import auth from "../../../middleware/auth.js";

// ✅ CONTROLLER
import * as imageController from "../Controllers/ImageController.js";

const router = express.Router();

console.log("🚀 Loading ImageRoutes...");
console.log("Controller Functions:", Object.keys(imageController));


// =====================
// MULTER
// =====================

const upload = multer({

 storage: multer.memoryStorage(),

 limits:{
  fileSize: 10 * 1024 * 1024
 }

});


// =====================
// ROUTES
// =====================


// ✅ ENHANCE IMAGE
router.post(

 "/enhance-image",

 auth.protectCustomer,   // ⭐ yahi use karna hai

 upload.array("image",1),

 imageController.enhanceImage

);


// ✅ SAVE LIBRARY
router.post(

 "/post-customer-liabrary",

 auth.protectCustomer,

 imageController.saveToLibrary

);


// ✅ GET LIBRARY
router.get(

 "/get-customer-liabrary",

 auth.protectCustomer,

 imageController.getLibraryImages

);


// ✅ COUNT
router.get(

 "/enhancement-count",

 auth.protectCustomer,

 imageController.getEnhancementCount

);


// TEST
router.get("/test",(req,res)=>{

 res.json({

  status:true,

  message:"Routes Working",

  controllerFunctions:Object.keys(imageController)

 });

});


console.log("✅ ImageRoutes Loaded Successfully");

export default router;
