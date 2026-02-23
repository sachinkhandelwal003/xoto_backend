import nodemailer from "nodemailer";

// Example: using Gmail SMTP
// For Gmail, you might need to enable "Less secure app access" or use App Passwords if 2FA is enabled
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com", // replace with your SMTP server
  port: 465,              // 465 for SSL, 587 for TLS
  secure: true,           // true for 465, false for 587
  auth: {
    user: process.env.SMTP_EMAIL,  // your email
    pass: process.env.SMTP_PASS  // your email password or app password
  }
});
 
/**
 * Send OTP email
 * @param {string} toEmail - recipient email
 * @param {number} otp - OTP code
 */
const sendOtpEmail = async (toEmail, otp) => {
  try {
    const mailOptions = {
      from: `"XOTO Support" <${process.env.SMTP_EMAIL}>`,
      to: toEmail,
      subject: "Your OTP Code",
      text: `Your OTP code is: ${otp}. It will expire in 5 minutes.`,
      html: `<p>Your OTP code is: <b>${otp}</b></p><p>It will expire in 5 minutes.</p>`
    };

    await transporter.sendMail(mailOptions);
    console.log(`OTP sent to ${toEmail}`);
  } catch (error) {
    console.error("Error sending OTP email:", error);
    throw error; // rethrow so your signup controller can handle it
  }
};

export default sendOtpEmail;