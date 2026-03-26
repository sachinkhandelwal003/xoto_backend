// models/PropertyModel.js

const mongoose = require("mongoose");

const PropertySchema = new mongoose.Schema(
    {
        // =========================
        // CREATOR INFO
        // =========================
        developer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Developer",
            default: null
        },
        
        agent: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Agent",
            default: null
        },
        
        agency: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Agency",
            default: null
        },

        // =========================
        // PROPERTY TYPE
        // =========================
        propertySubType: {
            type: String,
            enum: ["off_plan", "secondary", "rental"],
            required: true,
            default: "off_plan"
        },
        
        transactionType: {
            type: String,
            enum: ["rent", "sell"],
            default: "sell"
        },

        // =========================
        // PROJECT INFO
        // =========================
        projectOption: {
            type: String,
            enum: ["existing", "new"],
            default: "new"
        },
        
        existingProjectId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
            default: null
        },
        
        propertyName: {
            type: String,
            required: true,
            trim: true
        },
        
        developerName: {
            type: String,
            default: ""
        },

        // =========================
        // UNIT DETAILS
        // =========================
        unitNumber: {
            type: String,
            default: ""
        },
        
        floorNumber: {
            type: Number,
            default: 0
        },
        
        unitType: {
  type: String,
  enum: ["apartment", "villa", "townhouse", "duplex", "penthouse"],
  required: function () {
    return this.propertySubType !== "off_plan"; // ✅ only required for secondary
  }
}
        ,
        bedroomType: {
            type: String,
            enum: ["studio", "1bed", "2bed", "3bed", "4bed", "5bed", "6bed", "7bed", "8plus"],
            default: "1bed"
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
        builtUpArea: {
            type: Number,
            default: 0
        },
        
        builtUpArea_min: {
            type: Number,
            default: 0
        },

        builtUpArea_max: {
            type: Number,
            default: 0
        },

        builtUpAreaUnit: {
            type: String,
            enum: ["sqft", "sqm"],
            default: "sqft"
        },

        // =========================
        // PRICE
        // =========================
        price: {
            type: Number,
            default: 0
        },
        
        price_min: {
            type: Number,
            default: 0
        },
        
        price_max: {
            type: Number,
            default: 0
        },

        currency: {
            type: String,
            default: "AED"
        },

        // =========================
        // LOCATION
        // =========================
      area: {
  type: String,
  required: function () {
    return this.propertySubType !== "off_plan"; // ✅ only for secondary
  }
}
        ,
        city: {
            type: String,
            default: "Dubai"
        },
        
        country: {
            type: String,
            default: "UAE"
        },
        
        coordinates: {
            lat: { type: Number, default: null },
            lng: { type: Number, default: null }
        },
        
        proximity: {
            airport: { type: String, default: "" },
            metro: { type: String, default: "" },
            mall: { type: String, default: "" },
            school: { type: String, default: "" }
        },

        // =========================
        // MEDIA
        // =========================
        mainLogo: {
            type: String,
            default: ""
        },

        photos: {
            architecture: [{ type: String, default: [] }],
            interior: [{ type: String, default: [] }],
            lobby: [{ type: String, default: [] }],
            other: [{ type: String, default: [] }]
        },
        
        videoUrl: {
            type: String,
            default: ""
        },

        brochure: {
            type: String,
            default: ""
        },

        // =========================
        // DESCRIPTION
        // =========================
        description: {
            type: String,
            required: true,
            trim: true
        },

        // =========================
        // AMENITIES & FACILITIES
        // =========================
        amenities: {
            type: [String],
            default: []
        },
        
        facilities: {
            swimmingPool: { type: Boolean, default: false },
            gym: { type: Boolean, default: false },
            parking: { type: Boolean, default: false },
            childrenPlayArea: { type: Boolean, default: false },
            gardens: { type: Boolean, default: false },
            security: { type: Boolean, default: false },
            concierge: { type: Boolean, default: false }
        },

        // =========================
        // ADDITIONAL FEATURES
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
        
        ownershipType: {
            type: String,
            enum: ["freehold", "leasehold"],
            default: "freehold"
        },
        
        availableFrom: {
            type: Date,
            default: null
        },

        // =========================
        // OFF-PLAN SPECIFIC
        // =========================
        totalUnits: {
            type: Number,
            default: 0
        },
        
        completionDate: {
            quarter: { type: String, enum: ["Q1", "Q2", "Q3", "Q4"], default: null },
            year: { type: Number, default: null },
            fullDate: { type: Date, default: null }
        },
        
        projectStatus: {
            type: String,
            enum: ["presale", "under_construction", "ready", "sold_out"],
            default: "presale"
        },
        
        floors: {
            type: Number,
            default: 0
        },
        
        serviceChargeInfo: {
            type: String,
            default: "No info"
        },
        
        readinessProgress: {
            type: String,
            default: "0%"
        },
        
        // Payment Plan (Off-Plan)
        paymentPlan: [{
            title: { type: String },
            stages: [{
                stage: { type: String, enum: ["on_booking", "during_construction", "upon_handover", "other"] },
                percentage: { type: Number },
                description: { type: String }
            }]
        }],
        
        eoiAmount: {
            type: Number,
            default: 0
        },
        
        resaleConditions: {
            type: String,
            default: "Not specified"
        },

        // =========================
        // COMMISSION
        // =========================
        commission: {
            type: Number,
            default: 0
        },
        
        shareCommission: {
            type: Boolean,
            default: false
        },
        
        shareCommissionPercentage: {
            type: Number,
            default: 0
        },

        // =========================
        // STATUS & APPROVAL
        // =========================
        approvalStatus: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending"
        },
        
        listingStatus: {
            type: String,
            enum: ["pending", "active", "rejected", "inactive"],
            default: "pending"
        },
        
        rejectionReason: {
            type: String,
            default: ""
        },
        
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },
        
        approvedAt: {
            type: Date,
            default: null
        },
        
        isAvailable: {
            type: Boolean,
            default: true
        },
        
        isFeatured: {
            type: Boolean,
            default: false
        },
        
        showContactOnlyVerified: {
            type: Boolean,
            default: true
        },

        // =========================
        // STATISTICS
        // =========================
        totalInventory: {
            type: Number,
            default: 0
        },
        
        soldUnits: {
            type: Number,
            default: 0
        },
        
        reservedUnits: {
            type: Number,
            default: 0
        },
        
        bookedUnits: {
            type: Number,
            default: 0
        }
    },
    { timestamps: true }
);

// Indexes
PropertySchema.index({ developer: 1 });
PropertySchema.index({ agent: 1 });
PropertySchema.index({ propertySubType: 1 });
PropertySchema.index({ approvalStatus: 1 });
PropertySchema.index({ listingStatus: 1 });
PropertySchema.index({ area: 1 });
PropertySchema.index({ propertyName: "text", description: "text" });

const Property = mongoose.model("Properties", PropertySchema, "Properties");
module.exports = Property;