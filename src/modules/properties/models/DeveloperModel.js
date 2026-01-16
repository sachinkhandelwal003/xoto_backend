const mongoose = require("mongoose");

const DeveloperSchema = new mongoose.Schema({
    name: { type: String, trim: true, default: "", required: false }, //name is the companyName
    phone_number: { type: String, trim: true, default: "", required: false },
    country_code: { type: String, trim: true, default: "", required: false },
    password:{type: String, trim: true, default: "", required: false},
    email: { type: String, trim: true, default: "", required: false },
    logo: { type: String, default: "", trim: true, required: false },
    description: { type: String, default: "", trim: true, required: false },
    websiteUrl: {
        type: String,
        default: "",
        trim: true,
        required: false
    },
    country: {
        type: String,
        required: false,
        default: ""
    },
    city: {
        type: String,
        required: false,
        default: ""
    },
    address: {
        type: String,
        required: false,
        default: "",
    },
    reraNumber: {
        type: String,
        required: false,
        default: ""
    },
    documents: [
        { type: String, default: "", trim: true, required: false }
    ],

    isVerifiedByAdmin: {
        type: Boolean,
        default: false,
    },

    presentationsGenerated_stats: { type: Number, default: 0, required: false },
    leadsGenerated_stats: { type: Number, default: 0, required: false },
    unitsSold_stats: { type: Number, default: 0, required: false },
    conversionRate_stats: { type: Number, default: 0, required: false },
    commissionStatus_stats: { type: String, default: "pending", required: false, enum: ["pending", "approved", "paid", "rejected"] }
}, { timestamps: true });

const Developer = mongoose.model("Developer", DeveloperSchema, "Developers");
module.exports = Developer;
