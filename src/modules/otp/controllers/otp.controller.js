const Otp = require('../models/emailotp.model');
const sendEmail = require('../../../utils/sendEmail');
const {StatusCodes} = require('../../../utils/constants/statusCodes');

const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit
};

exports.sendOtpEmail= async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Email is required'
      });
    }

    // delete old OTPs
    await Otp.deleteMany({ email });

    const otp = generateOtp();

    await Otp.create({
      email,
      otp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 min
    });

    await sendEmail({
      to: email,
      subject: 'Email Verification OTP',
      html: `
        <h2>Email Verification</h2>
        <p>Your OTP is:</p>
        <h1>${otp}</h1>
        <p>This OTP will expire in 5 minutes.</p>
      `
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'OTP sent to email'
    });

  } catch (err) {
    console.error(err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to send OTP'
    });
  }
};

exports.verifyEmailOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Email and OTP are required'
      });
    }

    const otpDoc = await Otp.findOne({
      email,
      otp,
      verified: false,
      expiresAt: { $gt: new Date() }
    });

    if (!otpDoc) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    otpDoc.verified = true;
    await otpDoc.save();

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Email verified successfully'
    });

  } catch (err) {
    console.error(err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'OTP verification failed'
    });
  }
};
