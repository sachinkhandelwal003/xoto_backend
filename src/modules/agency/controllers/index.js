import Otp from "../models/OTP.js";
import Agency from "../models/index.js";
import sendOtpEmail from "../services/sendOTP.js"

const agencySignup = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            })
        }

        const existingAgency = await Agency.findOne({ email });

        if (existingAgency) {
            return res.status(400).json({
                success: false,
                message: "Agency already registered"
            });
        }

        const otp = Math.floor(100000 + Math.random() * 900000);

        await Otp.create({
            email,
            otp,
            expiresAt: Date.now() + 5 * 60 * 1000
        });

        // send email OTP (mailer)
        await sendOtpEmail(email, otp);

        return res.json({
            success: true,
            message: "OTP sent successfully"
        });
    } catch (error) {
        return res.status(500).json({
            status: false,
            message: `Error came ${error}`
        })
    }
}

export { agencySignup }