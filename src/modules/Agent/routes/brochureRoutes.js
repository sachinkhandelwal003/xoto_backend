const express = require('express');
const router = express.Router();
const Brochure = require('../models/Brochure');
const LeadInterest = require('../models/LeadInterest');
const axios = require('axios');
const FormData = require('form-data');
const upload = require('../../../middleware/s3Upload').default; // your multer-s3


// ✅ STEP 1: Upload brochure and get shareable link - FIXED VERSION
router.post(
  "/upload-brochure",
  upload.single("file"), // 🔥 DIRECT S3 UPLOAD
  async (req, res) => {
    try {
      const { leadId, propertyId, interestId } = req.body;

      if (!leadId || !propertyId) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields"
        });
      }

      // ✅ Get S3 file URL directly
      const fileUrl = req.file.location;

      // Generate tracking ID
      const trackingId = Math.random().toString(36).substring(2);

      const BASE_URL = process.env.BASE_URL || "https://xoto.ae";
      const shareLink = `${BASE_URL}/api/brochure/track/${trackingId}`;

      // Save DB
      const brochure = await Brochure.create({
        leadId,
        propertyId,
        interestId: interestId || null,
        fileUrl,
        fileName: req.file.key,
        trackingId,
        shareLink
      });

      // Update LeadInterest
      if (interestId) {
        await LeadInterest.findByIdAndUpdate(interestId, {
          'brochure.sent': true,
          'brochure.sent_at': new Date(),
          'brochure.file_url': fileUrl,
          $inc: { engagement_score: 20 }
        });
      }

      res.json({
        success: true,
        data: {
          fileUrl,
          shareLink,
          brochureId: brochure._id
        }
      });

    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

// ✅ STEP 2: Track when customer opens the link
router.get('/track/:trackingId', async (req, res) => {
  try {
    const { trackingId } = req.params;
    
    const brochure = await Brochure.findOne({ trackingId });
    if (!brochure) {
      return res.status(404).send('Brochure not found');
    }

    // Get client info
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    let device = 'Desktop';
    if (userAgent.includes('Mobile')) device = 'Mobile';
    if (userAgent.includes('iPad')) device = 'Tablet';

    // Record view
    brochure.views.push({
      viewedAt: new Date(),
      ip,
      userAgent,
      device
    });
    brochure.viewCount += 1;
    brochure.lastViewedAt = new Date();
    await brochure.save();

    // Update LeadInterest
    if (brochure.interestId) {
      await LeadInterest.findByIdAndUpdate(
        brochure.interestId,
        {
          'brochure.viewed': true,
          'brochure.viewed_at': new Date(),
          $inc: { engagement_score: 15 }
        }
      );
    }

    // Redirect to actual brochure
    res.redirect(brochure.fileUrl);

  } catch (error) {
    console.error('Tracking error:', error);
    res.status(500).send('Error tracking brochure');
  }
});

// ✅ STEP 3: Get brochure stats
router.get('/stats/:brochureId', async (req, res) => {
  try {
    const brochure = await Brochure.findById(req.params.brochureId)
      .populate('leadId', 'name email phone_number');

    if (!brochure) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    res.json({
      success: true,
      data: {
        viewCount: brochure.viewCount,
        lastViewedAt: brochure.lastViewedAt,
        views: brochure.views,
        shareLink: brochure.shareLink,
        lead: brochure.leadId
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;