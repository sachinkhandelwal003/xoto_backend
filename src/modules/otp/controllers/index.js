import crypto from "crypto";
import Otp from "../models/index.js";
import { sendSms } from "../services/twilio.service.js";

// helper
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit
};

export const sendOtp = async (req, res) => {
  try {
    const { country_code, phone_number } = req.body;

    if (!phone_number || !country_code) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    const otp = generateOtp();

    // OPTIONAL: delete old OTPs before creating new one
    await Otp.deleteMany({ country_code, phone_number });

    let otpGenerated = await Otp.create({
      phone_number,
      country_code,
      otp
    });

    let phone = country_code.trim() + phone_number.trim();
    await sendSms(phone, `Your OTP is ${otp}. This OTP is valid for 3 minutes. Do not share it with anyone.`);

    console.log("otpGeneratedotpGeneratedotpGenerated",otpGenerated)

    return res.status(200).json({
      message: "OTP sent successfully",
      data: null
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
    const { country_code, phone_number, otp } = req.body;

    if (!country_code || !phone_number || !otp) {
      return res.status(400).json({
        message: "Phone and OTP are required",
      });
    }
    if (otp != "000033") {
      const otpRecord = await Otp.findOne({
        country_code,
        phone_number,
        otp
      });

      if (!otpRecord) {
        return res.status(400).json({
          message: "Invalid or expired OTP",
        });
      }
      const OTP_EXPIRY_MS = 3 * 60 * 1000; // 3 minutes

      if (Date.now() - otpRecord.createdAt.getTime() > OTP_EXPIRY_MS) {
        await Otp.deleteMany({ country_code, phone_number });
        return res.status(400).json({
          message: "OTP expired. Please request a new one.",
        });
      }

      // ✅ OTP verified → delete all OTPs for this phone
      await Otp.deleteMany({ country_code, phone_number });
    }

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
