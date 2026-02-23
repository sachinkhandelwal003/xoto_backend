const nodemailer = require('nodemailer');
const EmailSettings = require('../modules/otp/models/email.model');

const sendEmail = async ({ to, subject, html }) => {
  const settings = await EmailSettings.findOne().select('+authPass');

  if (!settings) throw new Error('SMTP not configured');

  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: {
      user: settings.authUser,
      pass: settings.authPass
    }
  });

  await transporter.sendMail({
    from: `"${settings.fromName}" <${settings.fromEmail}>`,
    to,
    subject,
    html
  });
};

module.exports = sendEmail;
