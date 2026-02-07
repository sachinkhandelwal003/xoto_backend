const mongoose = require("mongoose");

const ProductSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VendorB2C",
      default: null,
    },
    name: {
      type: String,
      required: false,
      trim: true
    },
    photos:{
      type:[String],
      default:"",
      required:false
    },
      
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: false
    },

    brandName: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: false,
    },

    description: {
      type: String,
      default: "",
      trim: true
    },


    price: {
      type: Number,
      required: false
    },

    discountedPrice: {
      type: Number,
      default: 0
    },

    currency: {
      type: String,
      default: "AED"
    },

    quantity: {
      type: Number,
      default: 0
    },

    warrantyYears: {
      type: Number,
      default: 0
    },
    marginType: {
  type: String,
  enum: ["fixed", "percentage"],
  default: "fixed"
},

marginValue: {
  type: Number,
  default: 0
},

marginAmount: {
  type: Number,
  default: 0
},

salePrice: {
  type: Number,
  default: 0
}
,

    returnPolicyDays: {
      type: Number,
      default: 0
    },


    noCostEmiAvailable: {
      type: Boolean,
      default: false
    },

    keyFeatures: {
      type: [String],
      default: []
    },

    material: {
      type: [String],
      default: []
    },

    finish: { // is a specification 
      type: String,
      default: ""
    },

    assemblyRequired: {
      type: Boolean,
      default: false
    },

    assemblyToolsProvided: {
      type: Boolean,
      default: false
    },

    careInstructions: {
      type: String,
      default: ""
    },

    originCountry: {
      type: String,
      default: ""
    },

    isActive: {
      type: Boolean,
      default: true
    },

    isFeatured: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

const Product = mongoose.model("Product", ProductSchema, "Products");
module.exports = Product;


// colourse available is on another page 