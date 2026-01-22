import crypto from "crypto";
import Otp from "../models/otp.model.js";
import { sendSms } from "../services/twilio.service.js";

// helper
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit
};

export const sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    const otp = generateOtp();

    // OPTIONAL: delete old OTPs before creating new one
    await Otp.deleteMany({ phone });

    await Otp.create({
      phone,
      otp
    });

    await sendSms(phone, `Your OTP is ${otp} from . It is valid for 5 minutes.`);

    return res.status(200).json({
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server Error",
    });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        message: "Phone and OTP are required",
      });
    }

    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

    const otpRecord = await Otp.findOne({
      phone,
      expires_at: { $gt: new Date() },
    });

    if (!otpRecord) {
      return res.status(400).json({
        message: "Invalid or expired OTP",
      });
    }

    // ✅ OTP verified → delete all OTPs for this phone
    await Otp.deleteMany({ phone });

    return res.status(200).json({
      message: "OTP verified successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server Error",
    });
  }
};
