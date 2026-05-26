import express from 'express';
import { getAuditLogs, getEntityAuditTrail, getAuditStats } from '../controllers/auditLog.controller.js';
const { protectMulti } = require('../../../middleware/auth');

const router = express.Router();

// All vault roles (18/21/22/23/26) — visibility is filtered per role inside controller
router.use(protectMulti);

router.get('/',                         getAuditLogs);
router.get('/stats',                    getAuditStats);
router.get('/:entityType/:entityId',    getEntityAuditTrail);

module.exports = router;
