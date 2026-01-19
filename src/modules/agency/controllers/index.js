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
            purpose: "agency_signup",
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

const verifyOTP = async (req, res) => {
    try {
        let { otp, email } = req.body;
        const existingAgency = await Agency.findOne({ email });

        if (existingAgency) {
            return res.status(400).json({
                success: false,
                message: "Agency already registered"
            });
        }
        const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
        let newotp = Number(otp);
        console.log("nbodyyyyyyyyyyyyyyyyyyyyyyyyyyyyy", req.body)
        let verifyOTP = await Otp.findOne({ otp: newotp, email, purpose: "agency_signup", createdAt: { $gte: threeMinutesAgo } });
        console.log("nbodyyyyyyyyyyyyyyyyyyyyyyyyyyyyy", verifyOTP)



        if (!verifyOTP) {
            return res.status(400).json({
                success: false,
                message: "No otp found"
            })
        }




        const newagency = await Agency.create({ subscription_status: "free", otp_verified: true, is_active: false, ...req.body })

        // const otp = Math.floor(100000 + Math.random() * 900000);

        await Otp.deleteMany({
            email,
            purpose: "agency_signup",
        });


        return res.json({
            success: true,
            message: "OTP VERIFIED SUCCESSFULLY",
            newagency
        });
    } catch (error) {
        return res.status(500).json({
            status: false,
            message: `Error came ${error}`
        })
    }
}

const updateAgencyStatus = async (req, res) => {
    try {
        const { id } = req.query;

        const agency = await Agency.findById(id);

        if (!agency) {
            return res.status(404).json({
                success: false,
                message: "Agency not found"
            });
        }

        agency.is_active = !agency.is_active;
        await agency.save();

        return res.json({
            success: true,
            message: `Agency ${agency.is_active ? "activated" : "deactivated"} successfully`,
            data: agency
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};



export { agencySignup, verifyOTP, updateAgencyStatus }