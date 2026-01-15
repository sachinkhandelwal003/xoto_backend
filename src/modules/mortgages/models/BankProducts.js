const mongoose = require("mongoose");

const mortgageApplicationSchema = new mongoose.Schema({
    
    /* ========================
       APPLICATION IDENTITY
    ======================== */

    application_id: {
        type: String,              // SHQH7918
        required: false,
    },

    lead_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PropertyLead",
        required: false,
        index: true
    },

    /* ========================
       LOAN DETAILS
    ======================== */

    loan_type: {
        type: String,
        enum: ["purchase", "buy_out", "refinance"],
        required: false,
        default: "purchase"
    },

    mortgage_type: {
        type: String,
        enum: [
            "fixed",
            "variable",
            "hybrid",
            "-"          // when not selected yet
        ],
        default: "-"
    },

    loan_preference: {
        type: String,              // optional
        default: "-"
    },

    income_type: {
        type: String,
        enum: ["Salaried", "Self Employed"],
        required: false
    },

    /* ========================
       PROPERTY & LOAN VALUES
    ======================== */

    property_value: {
        type: Number,
        required: false
    },

    loan_amount: {
        type: Number,
        required: false
    },

    /* ========================
       APPLICATION STATUS
    ======================== */

    status: {
        type: String,
        enum: [
            "draft",
            "in_progress",
            "documents_pending",
            "submitted",
            "approved",
            "rejected"
        ],
        default: "in_progress",
        index: true
    },

    /* ========================
       ASSIGNMENT
    ======================== */

    mortgage_manager: {
        type: String,              
        required: false,
        default: ""
    }

}, {
    timestamps: true
});

mortgageApplicationSchema.index({ createdAt: -1 });
mortgageApplicationSchema.index({ lead_id: 1 });
mortgageApplicationSchema.index({ status: 1 });

module.exports = mongoose.model(
    "MortgageApplication",
    mortgageApplicationSchema,
    "MortgageApplications"
);

// application_id,lead_id,loan_type,mortgage_type,loan_preference,income_type,property_value,loan_amount,status,mortgage_manager