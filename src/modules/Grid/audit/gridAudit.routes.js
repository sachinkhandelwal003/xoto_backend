const express = require('express');
const router  = express.Router();
const { protectMulti } = require('../../../middleware/auth');
const { getGridAuditLogs, getGridAuditStats, exportAuditLogs, gridLogout } = require('./gridAudit.controller');

router.use(protectMulti);

router.get('/',        getGridAuditLogs);
router.get('/stats',   getGridAuditStats);
router.get('/export',  exportAuditLogs);
router.post('/logout', gridLogout);

module.exports = router;
