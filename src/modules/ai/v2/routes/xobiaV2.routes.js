const express = require('express');
const router  = express.Router();

const {
  createSession,
  startCrawler,
  searchWebsite,
  searchProperties,
  saveLead,
  getStatus
} = require('../controllers/xobiaV2.controller');

// OpenAI Realtime ephemeral token
router.post('/session',         createSession);

// Website crawler
router.post('/crawler/start',   startCrawler);

// Tool execution endpoints (called by frontend when AI fires a tool)
router.get('/search',           searchWebsite);
router.get('/properties',       searchProperties);
router.post('/lead',            saveLead);

// Health / debug
router.get('/status',           getStatus);

module.exports = router;
