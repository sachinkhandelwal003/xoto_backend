// controllers/otp.controller.js (New controller for OTP verification)

const asyncHandler = require('../../../../utils/asyncHandler');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const twilio = require('twilio');
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const verifySid = process.env.TWILIO_VERIFY_SID;


exports.sendOtp = asyncHandler(async (req, res, next) => {
  try {
    const { mobile } = req.body;
    if (!mobile) {
      throw new APIError('Mobile number is required', StatusCodes.BAD_REQUEST);
    }

    const response = await client.verify.v2.services(verifySid)
      .verifications.create({ to: mobile, channel: 'sms' });

    if (!response || !response.sid) {
      throw new APIError('Failed to send OTP, please try again later', StatusCodes.INTERNAL_SERVER_ERROR);
    }

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'OTP sent successfully',
      sid: response.sid // optional, can help for debugging
    });
  } catch (error) {
    // Handle unidentified errors
    if (!error.message) {
      error.message = 'Unidentified error';
    }
    // Handle Twilio errors explicitly
    if (error.code === 60200) {
      return next(new APIError('Invalid phone number format', StatusCodes.BAD_REQUEST));
    }
    if (error.code === 20404) {
      return next(new APIError('Twilio Verify Service not found', StatusCodes.INTERNAL_SERVER_ERROR));
    }
    if (error.code === 60203) {
      return next(new APIError('Max OTP attempts reached, please try later', StatusCodes.TOO_MANY_REQUESTS));
    }
    // fallback for unexpected errors
    return next(new APIError(error.message, StatusCodes.INTERNAL_SERVER_ERROR));
  }
});

exports.verifyOtp = asyncHandler(async (req, res, next) => {
  try {
    const { mobile, otp } = req.body;
    if (!mobile || !otp) {
      throw new APIError('Mobile and OTP are required', StatusCodes.BAD_REQUEST);
    }

    const verification = await client.verify.v2.services(verifySid)
      .verificationChecks.create({ to: mobile, code: otp });

    if (verification.status !== 'approved') {
      throw new APIError('Invalid OTP', StatusCodes.BAD_REQUEST);
    }

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'OTP verified successfully',
      verified: true
    });
  } catch (error) {
    // Handle unidentified errors
    if (!error.message) {
      error.message = 'Unidentified error';
    }
    next(error);
  }
});
