// models/InventoryModel.js

const mongoose = require("mongoose");

const PropertyInventorySchema = new mongoose.Schema(
    {
        // =========================
        // RELATIONSHIPS
        // =========================
        propertyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Properties",
            required: true
        },
        
        developerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Developers",
            required: true
        },

        // =========================
        // UNIT DETAILS
        // =========================
        unitNumber: {
            type: String,
            required: true,
            trim: true
        },
        
        buildingName: {
            type: String,
            default: "",
            trim: true
        },
        
        floorNumber: {
            type: Number,
            default: 0
        },
        
        unitType: {
            type: String,
            enum: ["apartment", "villa", "townhouse", "duplex", "penthouse"],
            required: true
        },
        
        bedroomType: {
            type: String,
            enum: ["studio", "1bed", "2bed", "3bed", "4bed", "5bed", "6bed", "7bed", "8plus"],
            required: true
        },
        
        bedrooms: {
            type: Number,
            default: 0
        },
        
        bathrooms: {
            type: Number,
            default: 0
        },

        // =========================
        // DIMENSIONS
        // =========================
        area: {
            type: Number,
            required: true
        },
        
        areaUnit: {
            type: String,
            enum: ["sqft", "sqm"],
            default: "sqft"
        },

        // =========================
        // PRICE
        // =========================
        price: {
            type: Number,
            required: true
        },
        
        currency: {
            type: String,
            default: "AED"
        },

        // =========================
        // VIEW & FEATURES
        // =========================
        hasView: {
            type: Boolean,
            default: false
        },
        
        viewType: {
            type: [String],
            enum: ["sea", "city", "garden", "landmark", "pool", "park"],
            default: []
        },
        
        parkingSpaces: {
            type: Number,
            default: 0
        },
        
        furnishing: {
            type: String,
            enum: ["furnished", "semi_furnished", "unfurnished"],
            default: "unfurnished"
        },

        // =========================
        // UNIT STATUS
        // =========================
        status: {
            type: String,
            enum: ["available", "reserved", "booked", "sold"],
            default: "available"
        },
        
        // Booking Details
        bookedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },
        
        bookedByCustomer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Customer",
            default: null
        },
        
        bookedAt: {
            type: Date,
            default: null
        },
        
        // Reservation Details
        reservedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },
        
        reservedAt: {
            type: Date,
            default: null
        },
        
        reservationExpiresAt: {
            type: Date,
            default: null
        },
        
        // Sale Details
        soldBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },
        
        soldAt: {
            type: Date,
            default: null
        },
        
        salePrice: {
            type: Number,
            default: 0
        },
        
        // =========================
        // PAYMENT DETAILS
        // =========================
        paymentPlan: {
            type: String,
            default: ""
        },
        
        downPayment: {
            type: Number,
            default: 0
        },
        
        downPaymentPaid: {
            type: Boolean,
            default: false
        },
        
        downPaymentPaidAt: {
            type: Date,
            default: null
        },
        
        // Commission
        commissionAmount: {
            type: Number,
            default: 0
        },
        
        commissionPaid: {
            type: Boolean,
            default: false
        },
        
        commissionPaidAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
);

// Indexes
PropertyInventorySchema.index({ propertyId: 1 });
PropertyInventorySchema.index({ developerId: 1 });
PropertyInventorySchema.index({ status: 1 });
PropertyInventorySchema.index({ unitNumber: 1 });
PropertyInventorySchema.index({ propertyId: 1, status: 1 });
PropertyInventorySchema.index({ unitType: 1 });

// Compound unique index for unit number per property
PropertyInventorySchema.index({ propertyId: 1, unitNumber: 1 }, { unique: true });

// ✅ FIX: Prevent overwrite error
const PropertyInventory = mongoose.models.PropertyInventory || 
                          mongoose.model("PropertyInventory", PropertyInventorySchema, "PropertyInventories");

module.exports = PropertyInventory;