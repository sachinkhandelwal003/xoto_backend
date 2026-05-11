const crypto = require('crypto');
const AgencyOTP = require('../models/OTP');

/**
 * Generate a cryptographically random 6-digit OTP.
 */
const generateOTP = () => {
  return String(crypto.randomInt(100000, 999999));
};

/**
 * Create and persist an OTP record for an agency.
 * Invalidates any previous unused OTPs for the same identifier.
 *
 * @param {string} identifier  - Phone number or email
 * @param {string} identifierType - 'phone' | 'email'
 * @param {string} agencyId    - Agency ObjectId
 * @param {string} purpose     - 'login' | 'password_reset'
 * @returns {string} The plain-text OTP (to be sent to the user)
 */
const createOTP = async (identifier, identifierType, agencyId, purpose = 'login') => {
  // Invalidate previous OTPs for this identifier
  await AgencyOTP.updateMany(
    { identifier, isUsed: false },
    { $set: { isUsed: true } },
  );

  const otp = generateOTP();

  await AgencyOTP.create({
    identifier,
    identifierType,
    otp,
    purpose,
    agencyId,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min
  });

  return otp;
};

/**
 * Send OTP via SMS (phone) or email.
 * Replace the stub implementations with your SMS/email provider SDK.
 *
 * @param {string} identifierType - 'phone' | 'email'
 * @param {string} identifier     - Destination
 * @param {string} otp            - 6-digit code
 * @param {string} purpose        - 'login' | 'password_reset'
 */
const sendOTP = async (identifierType, identifier, otp, purpose = 'login') => {
  const message =
    purpose === 'password_reset'
      ? `Your Xoto GRID password reset code is: ${otp}. It expires in 5 minutes.`
      : `Your Xoto GRID login code is: ${otp}. It expires in 5 minutes. Do not share this code.`;

  if (identifierType === 'phone') {
    // ── SMS Provider (e.g. Twilio / AWS SNS) ─────────────────────
    // const client = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    // await client.messages.create({ body: message, from: process.env.TWILIO_FROM, to: identifier });
    console.log(`[SMS → ${identifier}] ${message}`);
  } else {
    // ── Email Provider (e.g. SendGrid / AWS SES / Nodemailer) ─────
    // await sendgrid.send({ to: identifier, from: 'noreply@xoto.ae', subject: 'Xoto GRID OTP', text: message });
    console.log(`[EMAIL → ${identifier}] ${message}`);
  }
};

/**
 * Full flow: generate OTP → persist → send.
 *
 * @param {object} agency - Agency document (needs _id, primaryContactPhone, primaryContactEmail)
 * @param {string} purpose - 'login' | 'password_reset'
 * @param {string} channel - 'phone' | 'email' (defaults to phone)
 */
const generateAndSendOTP = async (agency, purpose = 'login', channel = 'phone') => {
  const identifier =
    channel === 'email' ? agency.primaryContactEmail : agency.primaryContactPhone;

  const otp = await createOTP(identifier, channel, agency._id, purpose);
  await sendOTP(channel, identifier, otp, purpose);

  return { identifier, channel };
};

module.exports = {
  generateOTP,
  createOTP,
  sendOTP,
  generateAndSendOTP,
};