import Otp from '../models/emailotp.model.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import Agent from '../../../modules/Agent/models/agent.js';
import VendorB2C from '../../../modules/auth/models/Vendor/B2cvendor.model.js';
import Freelancer from "../../../modules/auth/models/Freelancer/freelancer.model.js"
import Developer from "../../../modules/properties/models/DeveloperModel.js"
import sendEmail from '../../../utils/sendEmail.js';
import { StatusCodes } from '../../../utils/constants/statusCodes.js';
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit
};

export const sendOtpEmail = async (req, res) => {
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

export const verifyEmailOtp = async (req, res) => {
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

export const forgotPassword = async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!email || !role) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Email and role are required.'
      });
    }

    // Role ke hisaab se model aur reset URL choose karo
    let user;
    let resetPageUrl;

    if (role === 'agent') {
      user = await Agent.findOne({ email: email.toLowerCase().trim() });
      resetPageUrl = `${process.env.CLIENT_URL}/reset-password?role=agent`;
    } else if (role === 'vendor') {
      user = await VendorB2C.findOne({ email: email.toLowerCase().trim() });
      resetPageUrl = `${process.env.CLIENT_URL}/reset-password?role=vendor`;
    } else if (role === 'freelancer') {
      user = await Freelancer.findOne({ email: email.toLowerCase().trim() });
      resetPageUrl = `${process.env.CLIENT_URL}/reset-password?role=freelancer`;
    } else if (role === 'developer') {
      user = await Developer.findOne({ email: email.toLowerCase().trim() });
      resetPageUrl = `${process.env.CLIENT_URL}/reset-password?role=developer`;
    } else {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Invalid role. Must be agent, vendor, Freelancer.'
      });
    }

    // Security: same response whether user exists or not
    if (!user) {
      return res.status(StatusCodes.OK).json({
        success: true,
        message: 'If this email is registered, a reset link has been sent.'
      });
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');

    // Save token to DB with 1 hour expiry
    user.resetPasswordToken = token;
    user.resetPasswordExpires = new Date(Date.now() + 3600000);
    await user.save();

    // Build reset URL
    const resetUrl = `${resetPageUrl}&token=${token}`;
const roleLabel =
  role === 'agent' ? 'Agent Portal' :
  role === 'vendor' ? 'Vendor Portal' :
  role === 'freelancer' ? 'Execution Partners' :
  role === 'developer' ? 'Developer Portal' :
  role === 'agency' ? 'Agency Portal' : '';

const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0"
        style="background:#ffffff;border-radius:16px;overflow:hidden;
               box-shadow:0 4px 24px rgba(92,3,155,0.12);">

        <!-- Header -->
        <tr>
          <td style="background:#ffffff;padding:36px 40px;text-align:center;border-bottom:3px solid #5C039B;">
  <img
    src="https://xotostaging.s3.me-central-1.amazonaws.com/properties/1774009493065-logonew2%20%281%29.png"
    alt="Xoto Logo"
    width="140"
    style="display:block;margin:0 auto 12px;"
  />
  <p style="color:#5C039B;margin:0;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">
    ${roleLabel || 'Partner Portal'}
  </p>
</td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 44px;">

            <!-- Icon -->
            <div style="text-align:center;margin-bottom:24px;">
              <div style="display:inline-block;background:#f3e8ff;border-radius:50%;width:64px;height:64px;line-height:64px;text-align:center;">
                <span style="font-size:28px;">🔐</span>
              </div>
            </div>

            <h2 style="color:#1a1a1a;margin:0 0 12px;font-size:22px;text-align:center;">
              Password Reset Request
            </h2>

            <p style="color:#555;line-height:1.8;text-align:center;margin:0 0 32px;font-size:15px;">
              You requested to reset your password.<br/>
              Click the button below to proceed:
            </p>

            <!-- CTA Button -->
            <div style="text-align:center;margin:0 0 32px;">
              <a href="${resetUrl}"
  target="_self"
  style="background:#5C039B;
         color:#ffffff;text-decoration:none;
         padding:16px 44px;border-radius:50px;
         font-size:16px;font-weight:700;
         display:inline-block;
         letter-spacing:0.5px;
         box-shadow:0 4px 16px rgba(92,3,155,0.35);">
  Reset Password
</a>
            </div>

            <!-- Info Box -->
            <div style="background:#f8f4ff;border-left:4px solid #5C039B;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
              <p style="margin:0;color:#5C039B;font-size:14px;font-weight:600;">
                ⏱ This link is valid for <strong>1 hour</strong> only.
              </p>
            </div>

            <p style="color:#888;font-size:13px;line-height:1.7;margin:0 0 24px;">
              If you did not request a password reset, please ignore this email. 
              Your account remains secure.
            </p>

            <hr style="border:none;border-top:1px solid #eeeeee;margin:24px 0;"/>

            <!-- Fallback Link -->
            <p style="color:#aaa;font-size:12px;margin:0;">
              Button not working? Copy this link:<br/>
              <a href="${resetUrl}"
                 style="color:#5C039B;word-break:break-all;font-size:12px;">${resetUrl}</a>
            </p>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8f4ff;padding:24px 40px;text-align:center;border-top:1px solid #ede9f6;">
            <p style="color:#5C039B;font-size:13px;font-weight:600;margin:0 0 4px;">
              xoto.ae
            </p>
            <p style="color:#aaa;font-size:11px;margin:0;">
              © ${new Date().getFullYear()} Xoto · All rights reserved · Dubai, UAE
            </p>
            <p style="color:#ccc;font-size:11px;margin:8px 0 0;">
              Powered by AI. Inspired by you.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await sendEmail({
      to: user.email,
      subject: `Password Reset — xoto.ae${roleLabel ? ' ' + roleLabel : ''}`,
      html,
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      message: 'If this email is registered, a reset link has been sent.'
    });

  } catch (err) {
    console.error('forgotPassword error:', err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Internal server error. Please try again.'
    });
  }
};

// ─────────────────────────────────────────────────
// POST /api/otp/reset-password
// ─────────────────────────────────────────────────
export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword, role } = req.body;

    if (!token || !newPassword || !role) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Token, role and new password are required.'
      });
    }

    if (newPassword.length < 8) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Password must be at least 8 characters long.'
      });
    }

    // Role ke hisaab se sahi model choose karo
let Model;
if (role === 'agent') Model = Agent;
else if (role === 'vendor') Model = VendorB2C;
else if (role === 'freelancer') Model = Freelancer;
else if (role === 'developer') Model = Developer;
else if (role === 'agency') Model = Agency;
else {
  return res.status(StatusCodes.BAD_REQUEST).json({
    success: false,
    message: 'Invalid role.'
  });
}

    // Token se user dhundo + expiry check
    const user = await Model.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Reset link is invalid or has expired.'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and clear token
    user.password = hashedPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: 'Password has been reset successfully. You can now log in.'
    });

  } catch (err) {
    console.error('resetPassword error:', err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Internal server error. Please try again.'
    });
  }
};

