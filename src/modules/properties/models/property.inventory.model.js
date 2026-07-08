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
            default: null
        },
        
        unitType: {
            type: String,
            enum: [
                "apartment", "villa", "townhouse", "duplex", "penthouse",
                "plot", "office", "retail", "warehouse", "hotel_apartment"
            ],
            required: true
        },
        
        bedroomType: {
            type: String,
            enum: ["studio", "1bed", "2bed", "3bed", "4bed", "5bed", "6bed", "7bed", "8plus"],
            required: function() {
                return ["apartment", "villa", "townhouse", "duplex", "penthouse", "hotel_apartment"].includes(this.unitType);
            }
        },
        
        bedrooms: {
            type: Number,
            default: 0,
            min: [0, "Bedrooms cannot be negative"]
        },
        
        bathrooms: {
            type: Number,
            default: 0,
            min: [0, "Bathrooms cannot be negative"]
        },

        // =========================
        // DIMENSIONS
        // =========================
        area: {
            type: Number,
            required: true,
            min: [0.01, "Area must be greater than 0"]
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
            required: true,
            min: [0.01, "Price must be greater than 0"]
        },
        
        currency: {
            type: String,
            default: undefined
        },

        // =========================
        // VIEW & FEATURES
        // =========================
        hasView: {
            type: Boolean,
            default: undefined
        },
        
        viewType: {
            type: [String],
            enum: ["sea", "city", "garden", "landmark", "pool", "park"],
            default: undefined
        },
        
        parkingSpaces: {
            type: Number,
            default: undefined,
            min: [0, "Parking spaces cannot be negative"]
        },
        
        furnishing: {
            type: String,
            enum: ["furnished", "semi_furnished", "unfurnished"],
            default: undefined
        },

        // =========================
        // EXTRA FIELDS (FLEXIBLE FOR ALL PROPERTY TYPES)
        // =========================
        extraFields: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },

        // =========================
        // UNIT STATUS
        // =========================
        status: {
            type: String,
            enum: ["available", "hold", "reserved", "booked", "spa_signed", "sold", "handover", "cancelled"],
            default: "available"
        },
        
        // =========================
        // LINKED DEAL INFORMATION
        // =========================
        dealRecordId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "DealRecord",
            default: null
        },
        
        leadId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "GridLead",
            default: null
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
            default: undefined
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