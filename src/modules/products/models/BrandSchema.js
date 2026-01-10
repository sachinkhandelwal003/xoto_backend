const mongoose = require("mongoose");

const BrandSchema = new mongoose.Schema(
    {
        brandName: {
            type: String,
            required: false,
            trim: true,
        },
        photo: {
            type: String, // logo / brand image URL
            default: "",
            required: false
        },
        websiteUrl: {
            type: String,
            default: "",
            required: false
        },
        country: {
            type: String,
            default: "",
            required:false
        },
        description: {
            type: String,
            default: "",
            trim: true,
            required:false
        },
        isActive: {
            type: Boolean,
            default: true
        }
    },
    { timestamps: true }
);

const Brand = mongoose.model("Brand", BrandSchema, "Brands");
module.exports = Brand;
