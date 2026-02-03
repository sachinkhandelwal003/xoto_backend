// models/category.js
const mongoose = require('mongoose');

const mileStonebillSchema = new mongoose.Schema({
    project_id: {
        type: mongoose.Types.ObjectId,
        ref: "Project_freelancer",
        required: false
    },
    paid_by_customer: {
        type: Boolean,
        default: false,
        required: false
    },
    customer_id: {
        type: mongoose.Types.ObjectId,
        ref: "Customer",
        required: false
    },
    milestone_id: {
        type: String,
        default: "",
        required: false
    },
    price: {
        type: Number,
        default: 0,
        required: false
    },
    estimate_id: {
        type: mongoose.Types.ObjectId,
        ref: "Estimate",
        required: false
    },
    is_paid: {
        type: Boolean,
        required: false,
        default: false,
    }
}, { timestamps: true });


module.exports = mongoose.model('MileStonebill', mileStonebillSchema);