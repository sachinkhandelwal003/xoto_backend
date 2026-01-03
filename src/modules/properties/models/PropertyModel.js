const mongoose = require("mongoose");

const PropertySchema = new mongoose.Schema({
    developer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Developer",
        required: true
    },
    project_name: {
        type: String,
        default: "",
        required: true,
        trim: true
    },
    location: {
        type: String,
        default: "",
        required: true,
        trim: true
    },
    not_ready_yet: {
        type: Boolean,
        default: true,
        required: false
    },
    logo: {
        type: String,
        default: "",
        required: false,
        trim: true
    },
    google_location: {
        type: String,
        default: "",
        required: false,
        trim: true
    },
    brochure: {
        type: String,
        required: false,
        trim: true,
        default: ""
    } //brochure,google_location,logo,not_ready_yet,location
},
    { timestamps: true })


const Property = mongoose.model("Property", PropertySchema, "Property");
module.exports = Property;