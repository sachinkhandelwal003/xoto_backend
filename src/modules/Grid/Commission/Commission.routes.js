const express = require('express');
const router = express.Router();
const { getCommissions, updateCommissionStatus } = require('../Commission/Commission.controller');
const { protectMulti, authorize } = require('../../../middleware/auth');

router.get('/', protectMulti, getCommissions);

router.put('/:id/status', 
  protectMulti, 
  authorize({ roles: ['admin', 'Admin'] }),  // authorize already handles role.name check
  updateCommissionStatus
);

module.exports = router;