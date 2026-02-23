const mongoose = require("mongoose");

const mortgageApplicationProductRequirementsSchema = new mongoose.Schema({

    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Customer",
        required: false
    },

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
    product_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "BankMortgageProduct",
        required: false,
        default:null
    },
    purchase_type: {
        type: String,
        default: "",
        required: false
    },
    existing_mortgage: {
        type: String,
        default: "",
        required: false
    },
    found_property: {
        type: String,
        default: "yes",
        enum: ["yes", "no"],
        required: false
    },
    applicant: {
        type: String,
        default: "single",
        enum: ["single", "joint"],
        required: false
    },
    mortgage_type: {
        type: String,
        default: "fixed",
        enum: ["fixed", "variable", "tracker", "offset"],
        required: false
    },
    fixed_term: {
        type: String,
        default: "",
        required: false
    },
    loan_type: {
        type: String,
        default: "",
        required: false
    },
    loan_period: {
        type: Number,
        default: 0,
        required: false
    },
    loan_to_value: {
        type: Number,
        default: 0,
        required: false
    },
    primary_application_income_type: {
        type: String,
        default: "",
        required: false
    },
    primary_application_income: {
        type: Number,
        default: 0,
        required: false
    },
    primary_application_age: {
        type: Number,
        default: 0,
        required: false
    },
    primary_applicant_finance_audit: {
        type: String,
        default: "yes",
        enum: ["yes", "no"],
        required: false
    },
    property_value: {
        type: Number,
        default: 0,
        required: false
    },
    property_emirate: {
        type: String,
        default: "",
        required: false
    },
    property_area: {
        type: String,
        default: "",
        required: false
    },
}, {
    timestamps: true
});

mortgageApplicationProductRequirementsSchema.index({ createdAt: -1 });
mortgageApplicationProductRequirementsSchema.index({ lead_id: 1 });

module.exports = mongoose.model(
    "mortgageApplicationProductRequirements",
    mortgageApplicationProductRequirementsSchema,
    "mortgageApplicationProductRequirements"
);

