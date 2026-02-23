const mongoose = require("mongoose");

const mortgageApplicationCustomerDocumentSchema = new mongoose.Schema({

    /* ========================
       APPLICATION IDENTITY
    ======================== */

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

    passport: {
        type: String,
        default: "",
        required: false
    },
    visa: {
        type: String,
        default: "",
        required: false
    },
    emirates_id: {
        type: String,
        default: "",
        required: false
    },
    marriage_certificate: {
        type: String,
        default: "",
        required: false
    },
    bank_statements:{ // last 6 months
        type: [String],
        default: [],
        required: false
    },
    payslips:{
        type:[String],
        default:[],
        required:false
    },
    salary_certificate:{
        type:String,
        default:"",
        required:false
    }

    //Passport,Visa,Emirates ID , Marriage certificate , Bank Statements (6 Months) , Payslips (6 Months) , Salary Certificate (Proof of Bonus)

}, {
    timestamps: true
});

mortgageApplicationCustomerDocumentSchema.index({ createdAt: -1 });
mortgageApplicationCustomerDocumentSchema.index({ lead_id: 1 });

module.exports = mongoose.model(
    "mortgageApplicationCustomerDocument",
    mortgageApplicationCustomerDocumentSchema,
    "mortgageApplicationCustomerDocument"
);

