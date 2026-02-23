const nodemailer = require('nodemailer');
const {StatusCodes} = require('../../../utils/constants/statusCodes');
const EmailSettings = require('../models/email.model');

exports.createOrUpdateEmailSettings = async (req, res) => {
  try {
    const {
      host,
      port,
      secure,
      authUser,
      authPass,
      fromName,
      fromEmail
    } = req.body;

    let emailSettings = await EmailSettings.findOne().select('+authPass');

    const payload = {
      host: host ?? emailSettings?.host,
      port: port ? Number(port) : emailSettings?.port,
      secure: secure ?? emailSettings?.secure,
      authUser: authUser ?? emailSettings?.authUser,
      authPass: authPass ?? emailSettings?.authPass,
      fromName: fromName ?? emailSettings?.fromName,
      fromEmail: fromEmail ?? emailSettings?.fromEmail
    };

    // First time → all required
    if (
      !emailSettings &&
      (!payload.host ||
        !payload.port ||
        !payload.authUser ||
        !payload.authPass ||
        !payload.fromEmail)
    ) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'All SMTP fields are required for first-time setup'
      });
    }

    if (emailSettings) {
      emailSettings = await EmailSettings.findOneAndUpdate(
        {},
        payload,
        { new: true, runValidators: true }
      );
    } else {
      emailSettings = await EmailSettings.create(payload);
    }

    emailSettings.authPass = undefined;

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Email settings saved successfully',
      data: emailSettings
    });

  } catch (err) {
    console.error(err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to save email settings'
    });
  }
};



exports.getEmailSettings = async (req, res) => {
  try {
    const emailSettings = await EmailSettings.findOne();

    if (!emailSettings) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Email settings not found'
      });
    }

    emailSettings.authPass = undefined;

    res.status(StatusCodes.OK).json({
      success: true,
      data: emailSettings
    });

  } catch (err) {
    console.error(err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to fetch email settings'
    });
  }
};


exports.sendTestEmail = async (req, res) => {
  try {
    const { toEmail } = req.body;

    if (!toEmail) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Recipient email is required'
      });
    }

    const emailSettings = await EmailSettings
      .findOne()
      .select('+authPass');

    if (!emailSettings) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Email settings not configured'
      });
    }

    const transporter = nodemailer.createTransport({
      host: emailSettings.host,
      port: emailSettings.port,
      secure: emailSettings.secure,
      auth: {
        user: emailSettings.authUser,
        pass: emailSettings.authPass
      }
    });

    await transporter.verify();

    await transporter.sendMail({
      from: `"${emailSettings.fromName}" <${emailSettings.fromEmail}>`,
      to: toEmail,
      subject: 'SMTP Test Email',
      html: `<p>This is a test email sent using your SMTP configuration.</p>`
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Test email sent successfully'
    });

  } catch (err) {
    console.error(err);
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: 'Failed to send test email',
      error: err.message
    });
  }
};

