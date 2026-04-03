import crypto from "crypto";
import Otp from "../models/index.js";
import { sendSms } from "../services/twilio.service.js";

// helper
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit
};

// // 👉 You can move this to .env
// const BYPASS_OTP = process.env.BYPASS_OTP || "000033";

// export const sendOtp = async (req, res) => {
//   try {
//     const { country_code, phone_number } = req.body;

//     if (!phone_number || !country_code) {
//       return res.status(400).json({ message: "Phone number is required" });
//     }

//     const otp = generateOtp();

//     // delete old OTPs
//     await Otp.deleteMany({ country_code, phone_number });

//     const otpGenerated = await Otp.create({
//       phone_number,
//       country_code,
//       otp
//     });

//     const phone = country_code.trim() + phone_number.trim();

//     await sendSms(
//       phone,
//       `Your OTP is ${otp}. This OTP is valid for 3 minutes. Do not share it with anyone.`
//     );

//     console.log("OTP Generated:", otpGenerated);

//     return res.status(200).json({
//       message: "OTP sent successfully",
//       data: null
//     });

//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({
//       message: "Server Error",
//     });
//   }
// };

// export const verifyOtp = async (req, res) => {
//   try {
//     const { country_code, phone_number, otp } = req.body;

//     if (!country_code || !phone_number || !otp) {
//       return res.status(400).json({
//         message: "Phone and OTP are required",
//       });
//     }

//     // ✅ BYPASS OTP (use only in dev or controlled env)
//     if (
//       otp === BYPASS_OTP
//      ) {
//       return res.status(200).json({
//         message: "OTP verified successfully (bypass)",
//       });
//     }

//     // 🔍 Find OTP record
//     const otpRecord = await Otp.findOne({
//       country_code,
//       phone_number,
//       otp
//     });

//     if (!otpRecord) {
//       return res.status(400).json({
//         message: "Invalid or expired OTP",
//       });
//     }

//     // ⏱️ Check expiry (3 minutes)
//     const OTP_EXPIRY_MS = 3 * 60 * 1000;

//     if (Date.now() - otpRecord.createdAt.getTime() > OTP_EXPIRY_MS) {
//       await Otp.deleteMany({ country_code, phone_number });

//       return res.status(400).json({
//         message: "OTP expired. Please request a new one.",
//       });
//     }

//     // ✅ OTP verified → delete all OTPs for this phone
//     await Otp.deleteMany({ country_code, phone_number });

//     return res.status(200).json({
//       message: "OTP verified successfully",
//     });

//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({
//       message: "Server Error",
//     });
//   }
// };




const BYPASS_OTP = process.env.BYPASS_OTP || "000033";
const OTP_MODE = process.env.OTP_MODE; // DEV or PROD

// ==========================================
// SEND OTP
// ==========================================
export const sendOtp = async (req, res) => {
  try {
    const { country_code, phone_number } = req.body;

    if (!phone_number || !country_code) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    const phone = country_code.trim() + phone_number.trim();

    // ✅ Always DEV MODE (no OTP, no SMS)
    console.log("🚀 DEV MODE: OTP not sent");
    console.log("Phone:", phone);
    console.log("Use OTP: 000033");

    return res.status(200).json({
      message: "OTP sent successfully (DEV MODE)",
      data: null
    });

  } catch (error) {
    console.error("SEND OTP ERROR:", error);
    return res.status(500).json({
      message: "Server Error",
    });
  }
};

// ==========================================
// VERIFY OTP
// ==========================================
export const verifyOtp = async (req, res) => {
  try {
    const { country_code, phone_number, otp } = req.body;

    if (!country_code || !phone_number) {
      return res.status(400).json({
        message: "Phone is required",
      });
    }

    // ✅ Only allow 000033
    if (otp === "000033") {
      return res.status(200).json({
        message: "OTP verified successfully",
      });
    }

    return res.status(400).json({
      message: "Invalid OTP (use 000033)",
    });

  } catch (error) {
    console.error("VERIFY OTP ERROR:", error);
    return res.status(500).json({
      message: "Server Error",
    });
  }
};