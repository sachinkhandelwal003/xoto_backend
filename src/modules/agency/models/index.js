const mongoose = require("mongoose");

const AgencySchema = new mongoose.Schema({
    email: {
        type: String, required: false, default: ""
    },
    password: {
        type: String, required: false, default: ""
    },

    profile_photo: {
        type: String, required: false, default: ""
    },
    country_code: {
        type: String, required: false, default: ""
    },
    mobile_number: {
        type: String, required: false, default: ""
    },
    letter_of_authority: {
        type: String, required: false, default: ""
    },
    subscription_status: {
        type: String, required: false, default: "free", enum: ["free", "paid"]
    },
    is_active: { type: Boolean, required: false, default: false },
})

module.exports = mongoose.model("Agency", AgencySchema);