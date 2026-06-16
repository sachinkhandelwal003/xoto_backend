const Newsletter = require("../model/newsletter.model");
const Customer = require("../../auth/models/user/customer.model");
const sendEmail = require("../../../utils/sendEmail");

// Helper to send welcome/confirmation email
const sendWelcomeEmail = async (email) => {
  try {
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
                  Newsletter Subscription
                </p>
              </td>
            </tr>
    
            <!-- Body -->
            <tr>
              <td style="padding:40px 44px;">
                <!-- Icon -->
                <div style="text-align:center;margin-bottom:24px;">
                  <div style="display:inline-block;background:#f3e8ff;border-radius:50%;width:64px;height:64px;line-height:64px;text-align:center;">
                    <span style="font-size:28px;">📩</span>
                  </div>
                </div>
    
                <h2 style="color:#1a1a1a;margin:0 0 12px;font-size:22px;text-align:center;">
                  Welcome to the Xoto Newsletter!
                </h2>
    
                <p style="color:#555;line-height:1.8;text-align:left;margin:0 0 24px;font-size:15px;">
                  Hi there,
                </p>
                <p style="color:#555;line-height:1.8;text-align:left;margin:0 0 24px;font-size:15px;">
                  Thank you for subscribing to our newsletter! You've been successfully added to our mailing list.
                </p>
                <p style="color:#555;line-height:1.8;text-align:left;margin:0 0 24px;font-size:15px;">
                  From now on, you'll be the first to receive:
                </p>
                <ul style="color:#555;line-height:1.8;font-size:15px;margin-bottom:24px;padding-left:20px;">
                  <li>Latest Dubai real estate market insights and trends.</li>
                  <li>Exclusive announcements on new property launches and listings.</li>
                  <li>Expert tips on property investment, purchasing, and mortgages.</li>
                </ul>
    
                <div style="background:#f8f4ff;border-left:4px solid #5C039B;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
                  <p style="margin:0;color:#5C039B;font-size:14px;font-weight:600;">
                    ✨ Stay tuned for our upcoming updates and reports!
                  </p>
                </div>
    
                <p style="color:#888;font-size:13px;line-height:1.7;margin:0;">
                  If you did not subscribe to this list, or want to opt-out, you can request to unsubscribe at any time.
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
              </td>
            </tr>
    
          </table>
        </td></tr>
      </table>
    </body>
    </html>
    `;

    await sendEmail({
      to: email,
      subject: "Welcome to the Xoto Newsletter!",
      html
    });
    console.log(`Newsletter confirmation email sent to ${email}`);
  } catch (err) {
    console.error(`Failed to send newsletter confirmation email to ${email}:`, err);
  }
};

// Subscribe to newsletter
const subscribe = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ success: false, message: "Valid email is required" });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check if already subscribed
    let subscription = await Newsletter.findOne({ email: cleanEmail });

    if (subscription) {
      if (subscription.isActive) {
        return res.status(200).json({ success: true, message: "Already subscribed to newsletter" });
      } else {
        // Reactivate subscription
        subscription.isActive = true;
        // Check if customer now exists for this email
        const customer = await Customer.findOne({ email: cleanEmail, is_deleted: false });
        subscription.customer = customer ? customer._id : null;
        await subscription.save();

        // Send email asynchronously
        sendWelcomeEmail(cleanEmail);

        return res.status(200).json({ success: true, message: "Re-subscribed to newsletter successfully", data: subscription });
      }
    }

    // Lookup customer with the same email
    const customer = await Customer.findOne({ email: cleanEmail, is_deleted: false });

    // Create subscription
    subscription = await Newsletter.create({
      email: cleanEmail,
      customer: customer ? customer._id : null,
      isActive: true,
    });

    // Send email asynchronously
    sendWelcomeEmail(cleanEmail);

    return res.status(201).json({
      success: true,
      message: "Subscribed to newsletter successfully",
      data: subscription,
    });

  } catch (err) {
    console.error("Newsletter subscribe error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Unsubscribe from newsletter
const unsubscribe = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const subscription = await Newsletter.findOne({ email: email.toLowerCase().trim() });
    if (!subscription) {
      return res.status(404).json({ success: false, message: "Subscription not found" });
    }

    subscription.isActive = false;
    await subscription.save();

    return res.status(200).json({ success: true, message: "Unsubscribed from newsletter successfully" });

  } catch (err) {
    console.error("Newsletter unsubscribe error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Get all subscribers (Admin)
const getAllSubscribers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", isActive } = req.query;

    const filter = {};
    if (search) {
      filter.email = { $regex: search, $options: "i" };
    }
    if (isActive !== undefined && isActive !== "") {
      filter.isActive = isActive === "true";
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [subscribers, total] = await Promise.all([
      Newsletter.find(filter)
        .populate("customer", "name email mobile")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Newsletter.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      data: subscribers,
    });

  } catch (err) {
    console.error("Get subscribers error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Send individual email message
const sendIndividualEmail = async (req, res) => {
  try {
    const { email, subject, message } = req.body;
    if (!email || !subject || !message) {
      return res.status(400).json({ success: false, message: "Email, subject and message are required" });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Format custom email template
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
                  Update Notification
                </p>
              </td>
            </tr>
    
            <!-- Body -->
            <tr>
              <td style="padding:40px 44px;">
                <div style="color:#333333;line-height:1.8;font-size:15px;white-space:pre-wrap;">${message}</div>
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
              </td>
            </tr>
    
          </table>
        </td></tr>
      </table>
    </body>
    </html>
    `;

    await sendEmail({
      to: cleanEmail,
      subject: subject,
      html
    });

    return res.status(200).json({ success: true, message: "Email sent successfully" });
  } catch (err) {
    console.error("Error sending individual email from newsletter module:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to send email" });
  }
};

// Send bulk email message
const sendBulkEmail = async (req, res) => {
  try {
    const { subject, message } = req.body;
    if (!subject || !message) {
      return res.status(400).json({ success: false, message: "Subject and message are required" });
    }

    // Find all active subscribers
    const subscribers = await Newsletter.find({ isActive: true });
    if (!subscribers.length) {
      return res.status(400).json({ success: false, message: "No active subscribers found" });
    }

    const emails = subscribers.map(sub => sub.email);

    // Format custom email template
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
                  Newsletter Announcement
                </p>
              </td>
            </tr>
    
            <!-- Body -->
            <tr>
              <td style="padding:40px 44px;">
                <div style="color:#333333;line-height:1.8;font-size:15px;white-space:pre-wrap;">${message}</div>
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
              </td>
            </tr>
    
          </table>
        </td></tr>
      </table>
    </body>
    </html>
    `;

    // Send individually to keep emails private
    let successCount = 0;
    let failCount = 0;
    for (const email of emails) {
      try {
        await sendEmail({
          to: email,
          subject: subject,
          html
        });
        successCount++;
      } catch (sendErr) {
        console.error(`Failed to send bulk email to ${email}:`, sendErr);
        failCount++;
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: `Successfully sent to ${successCount} subscribers. Failed: ${failCount}` 
    });
  } catch (err) {
    console.error("Error sending bulk newsletter email:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to send bulk email" });
  }
};

module.exports = {
  subscribe,
  unsubscribe,
  getAllSubscribers,
  sendIndividualEmail,
  sendBulkEmail,
};
