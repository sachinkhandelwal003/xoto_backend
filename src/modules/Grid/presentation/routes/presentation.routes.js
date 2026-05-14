const express = require('express');
const router = express.Router();
const {
  generateNarrative,
  savePresentationHandler,
  trackAndServe,
  getViews,
  getMyPresentations,
  deletePresentation,
} = require('../controller/presentation.controller');

// Tera existing auth middleware — apna path daalo
const { protectMulti  } = require('../../../../middleware/auth');

// ── Public route — no auth (client tracking link) ──
router.get('/track/:token', trackAndServe);

// ── Protected routes — agent logged in hona chahiye ──
router.post('/generate-narrative', protectMulti , generateNarrative);
router.post('/save',               protectMulti , savePresentationHandler);
router.get('/my',                  protectMulti , getMyPresentations);
router.get('/views/:presentationId', protectMulti , getViews);
router.delete('/:id',              protectMulti , deletePresentation);

module.exports = router;