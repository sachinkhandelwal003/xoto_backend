const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
    otp: {
        type: Number, required: false
    },
    purpose: {
        type: String, default: "", required: false
    },
    country_code: {
        type: String, default: "", required: false
    },
    phone_number: {
        type: String, default: "", required: false
    },
    email: {
        type: String, default: "", required: false
    },
    expiresAt: {
        type: Date, required: false
    }
}, { timestamps: true })

module.exports = mongoose.model("OTP", otpSchema);