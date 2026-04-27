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
    const { 
      host,
      port,
      secure,
      authUser,
      authPass,
      fromName,
      fromEmail,
      toEmail
    } = req.body;

    console.log('\n========================================');
    console.log('📧 SMTP Test Email API');
    console.log('========================================\n');

    // Test 1: Validate All Required Fields
    console.log('Test 1: Validating Required Fields...');
    const requiredFields = { host, port, authUser, authPass, fromEmail, toEmail };
    const missingFields = [];

    for (const [key, value] of Object.entries(requiredFields)) {
      if (!value) {
        missingFields.push(key);
        console.log(`   ❌ ${key}: Missing`);
      } else {
        console.log(`   ✅ ${key}: Provided`);
      }
    }

    if (missingFields.length > 0) {
      console.log(`\n❌ Validation Failed: Missing fields - ${missingFields.join(', ')}\n`);
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'All fields are required',
        missingFields: missingFields,
        requiredFields: {
          host: 'SMTP server hostname (e.g., smtp.gmail.com)',
          port: 'SMTP port (587 or 465)',
          secure: 'Use TLS/SSL (true or false)',
          authUser: 'Email address for authentication',
          authPass: 'Password or app password',
          fromName: 'Display name for sender',
          fromEmail: 'Email address to send from',
          toEmail: 'Recipient email address'
        }
      });
    }

    console.log('✅ All required fields provided\n');

    // Test 2: Create Transporter with Manual Settings
    console.log('Test 2: Creating SMTP Transporter...');
    console.log(`   Host: ${host}`);
    console.log(`   Port: ${port}`);
    console.log(`   Secure: ${secure}`);
    console.log(`   Auth User: ${authUser}`);

    const transporter = nodemailer.createTransport({
      host: host,
      port: Number(port),
      secure: secure === true || secure === 'true',
      auth: {
        user: authUser,
        pass: authPass
      }
    });

    console.log('✅ Transporter created\n');

    // Test 3: Verify SMTP Connection
    console.log('Test 3: Verifying SMTP Connection...');
    try {
      await transporter.verify();
      console.log('✅ SMTP Connection Verified\n');
    } catch (verifyErr) {
      console.log(`❌ SMTP Connection Failed: ${verifyErr.message}\n`);
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'SMTP connection failed',
        test: 'SMTP Connection Verification',
        status: 'FAILED',
        error: verifyErr.message,
        smtpConfig: {
          host: host,
          port: Number(port),
          secure: secure,
          authUser: authUser
        },
        errorDetails: {
          code: verifyErr.code,
          hostname: verifyErr.hostname,
          syscall: verifyErr.syscall
        },
        timestamp: new Date().toISOString()
      });
    }

    // Test 4: Send Test Email
    console.log('Test 4: Sending Test Email...');
    console.log(`   From: "${fromName}" <${fromEmail}>`);
    console.log(`   To: ${toEmail}`);
    console.log(`   Subject: SMTP Test Email`);

    let mailResponse;
    try {
      mailResponse = await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: toEmail,
        subject: 'SMTP Test Email',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #28a745;">✅ SMTP Configuration Test Successful!</h2>
            <p style="color: #666; font-size: 16px;">
              Your SMTP email settings are working correctly.
            </p>
            
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3 style="color: #333; margin-top: 0;">Configuration Details:</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>From Email:</strong></td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;">${fromEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Sender Name:</strong></td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;">${fromName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>SMTP Host:</strong></td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;">${host}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>SMTP Port:</strong></td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;">${port}</td>
                </tr>
                <tr>
                  <td style="padding: 8px;"><strong>Secure (TLS/SSL):</strong></td>
                  <td style="padding: 8px;">${secure ? 'Yes (465)' : 'No (587)'}</td>
                </tr>
              </table>
            </div>
            
            <p style="color: #666; font-size: 14px; margin-top: 20px;">
              You can now use this email configuration to send emails from your application.
            </p>
            
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">
              Test sent at: ${new Date().toLocaleString()}<br>
              This is an automated test email.
            </p>
          </div>
        `
      });
      console.log('✅ Test Email Sent Successfully');
      console.log(`   Message ID: ${mailResponse.messageId}`);
      console.log(`   Response: ${mailResponse.response}\n`);
    } catch (sendErr) {
      console.log(`❌ Email Sending Failed: ${sendErr.message}\n`);
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Failed to send test email',
        test: 'Email Sending',
        status: 'FAILED',
        error: sendErr.message,
        smtpConnection: 'PASSED',
        emailDetails: {
          from: fromEmail,
          to: toEmail,
          subject: 'SMTP Test Email'
        },
        timestamp: new Date().toISOString()
      });
    }

    // All Tests Passed
    console.log('========================================');
    console.log('✅ ALL TESTS PASSED!');
    console.log('========================================\n');

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Test email sent successfully - All tests passed! ✅',
      tests: {
        fieldValidation: {
          status: 'PASSED',
          providedFields: Object.keys(requiredFields).length
        },
        smtpConnection: {
          status: 'PASSED',
          host: host,
          port: Number(port),
          secure: secure,
          authUser: authUser
        },
        emailSending: {
          status: 'PASSED',
          from: fromEmail,
          to: toEmail,
          subject: 'SMTP Test Email',
          messageId: mailResponse.messageId,
          response: mailResponse.response
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.log('========================================');
    console.log(`❌ Unexpected Error: ${err.message}`);
    console.log('========================================\n');
    
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Unexpected error occurred',
      error: err.message,
      errorDetails: {
        code: err.code,
        errno: err.errno,
        syscall: err.syscall
      },
      timestamp: new Date().toISOString()
    });
  }
};

