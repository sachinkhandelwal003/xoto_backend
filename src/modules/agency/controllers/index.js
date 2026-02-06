import Otp from "../models/OTP.js";
import Agency from "../models/index.js";
import sendOtpEmail from "../services/sendOTP.js"
import bcrypt from "bcryptjs";
import Agent from "../models/agent.js"
import jwt from "jsonwebtoken"

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

        let new_password = await bcrypt.hash(password, 10)

        if (!verifyOTP) {
            return res.status(400).json({
                success: false,
                message: "No otp found"
            })
        }




        const newagency = await Agency.create({ subscription_status: "free", otp_verified: true, is_active: true, password: new_password, ...req.body })

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


const agentSignup = async (req, res) => {
    try {

        let { email, password, country_code, phone_number } = req.body;

        let emailAlreadyExist = await Agent.findOne({ email: email });

        if (emailAlreadyExist) {
            return res.status(200).json({
                message: "Agent Already exist for this email"
            })
        }

        let phoneNumberAlreadyExist = await Agent.findOne({
            country_code, phone_number
        })

        if (phoneNumberAlreadyExist) {
            return res.status(200).json({
                message: "Agent Already exist for this number"
            })
        }

        let new_password = await bcrypt.hash(password, 10)

        const newAgent = await Agent.create({
            ...req.body, password: new_password
        });


        return res.status(201).json({
            success: true,
            message: "Account created successfully",
            data: newAgent
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

const agentLogin = async (req, res) => {
    try {

        let { email, password } = req.body;

        let emailExist = await Agent.findOne({ email: email });

        if (!emailExist) {
            return res.status(200).json({
                message: "Wrong credentials"
            })
        }

        if (emailExist.isVerifiedByAdmin == false) {
            return res.status(200).json({
                message: "Your account is not verified yet . Please contact support "
            })
        }


        let password_match = await bcrypt.compare(password, emailExist.password)

        if (!password_match) {
            return res.status(400).json({
                status: "error",
                message: "Wrong credentials"
            })
        }


        const token = jwt.sign(
            { agentId: emailExist._id, role: "GRID_AGENT" },
            process.env.JWT_SECRET,
            { expiresIn: "100d" }
        );

        let agentData = emailExist.toObject();
        delete agentData.password;


        return res.status(201).json({
            success: true,
            message: "Account login successfully",
            data: { user: agentData, token }
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


const updateAgent = async (req, res) => {
    try {

        let { id } = req.query;

        let agent = await Agent.findOneAndUpdate({ _id: id }, {
            ...req.body
        }, { new: true })

        return res.status(201).json({
            success: true,
            message: "Agent updated successfully",
            data: agent
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

const getAllAgents = async (req, res) => {
    try {

        let agent = await Agent.find({})

        return res.status(201).json({
            success: true,
            message: "Agents fetched successfully",
            data: agent
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};



export { getAllAgents, agentLogin, agencySignup, updateAgent, verifyOTP, updateAgencyStatus, agentSignup }