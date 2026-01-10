const mongoose = require("mongoose");

const ProductColourSchema = new mongoose.Schema(
    {
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: false,
            index: true
        },

        colourName: {
            type: String,
            required: false,
            trim: true
        },

        photos: {
            type: String,
            required: false,
            default: []
        },

        isActive: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

ProductColourSchema.index({ product: 1, colourName: 1 }, { unique: true });

const ProductColour = mongoose.model(
    "ProductColour",
    ProductColourSchema,
    "ProductColours"
);

module.exports = ProductColour;
