const mongoose = require("mongoose");

const mortgageApplicationCustomerDetailsSchema = new mongoose.Schema({

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

    full_name: {
        type: String,
        default: "",
        required: false
    },
    dob: {
        type: String,
        default: "",
        required: false
    },
    gender: {
        type: String,
        default: "male",
        enum: ["male", "female"],
        required: false
    },
    marital_status: {
        type: String,
        default: "single",
        enum: ["single", "divorced", "married"]
    },
    residence_status: {
        type: String,
        default: "",
    },
    nationality: {
        type: String,
        default: "UAE"
    },
    monthly_salary: {
        type: Number,
        default: 0,
        required: false
    },
    employer: {
        type: String,
        default: "",
        required: false
    },
    passport_number: {
        type: String,
        default: "",
        required: false
    },
    passport_issueing_country: {
        type: String,
        default: "",
        required: false
    },
    emirates_id:{
        type: String,
        default: "",
        required: false
    },
    emirated_expiry_date:{
        type:Date,
        default:Date.now(),
        required:false
    },
    building_name:{
        type:String,
        default:"",
        required:false
    },
    residential_address_unit:{
        type:Number,
        default:0,
        required:false
    },
    street_address:{
        type:String,
        default:"",
        required:false
    },
    country:{
        type:String,
        default:"",
        required:false
    },
    city:{
        type:String,
        default:"",
        required:false
    },
    emirate:{
        type:String,
        default:"",
        required:false
    },

}, {
    timestamps: true
});

mortgageApplicationCustomerDetailsSchema.index({ createdAt: -1 });
mortgageApplicationCustomerDetailsSchema.index({ lead_id: 1 });

module.exports = mongoose.model(
    "mortgageApplicationCustomerDetails",
    mortgageApplicationCustomerDetailsSchema,
    "mortgageApplicationCustomerDetails"
);

