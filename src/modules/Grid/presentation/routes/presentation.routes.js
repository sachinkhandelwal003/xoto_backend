const express = require('express');
const router = express.Router();
const {
  generateNarrative,
  savePresentationHandler,
  trackAndServe,
  previewAndServe,
  getViews,
  getMyPresentations,
  getLeadPresentationsHandler,
  deletePresentation,
  proxyImage,
  downloadPdf,
} = require('../controller/presentation.controller');

// Tera existing auth middleware — apna path daalo
const { protectMulti  } = require('../../../../middleware/auth');

// ── Public route — no auth (client tracking link) ──
router.get('/track/:token', trackAndServe);
router.get('/image-proxy', proxyImage); 
router.get('/pdf/:token',   downloadPdf);

// ── Protected routes — agent logged in hona chahiye ──
router.post('/generate-narrative', protectMulti , generateNarrative);
router.post('/save',               protectMulti , savePresentationHandler);
router.get('/preview/:token',      protectMulti , previewAndServe);
router.get('/my',                  protectMulti , getMyPresentations);
router.get('/views/:presentationId', protectMulti , getViews);
router.get('/lead/:leadId',         protectMulti , getLeadPresentationsHandler);
router.delete('/:id',              protectMulti , deletePresentation);

module.exports = router;
