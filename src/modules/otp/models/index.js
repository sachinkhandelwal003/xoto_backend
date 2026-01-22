import mongoose from "mongoose";

const otpSchema = new mongoose.Schema({
    phone: {
        type: String,
        required: true,
        index: true,
    },
    otp: {
        type: Number,
        required: false,
    }
}, { timestamps: true });

export default mongoose.model("Otp", otpSchema);
