import express from 'express';
import { clientLogin, generateClientPortalAccess, revokeClientPortalAccess, getPartnerClients } from '../controllers/client.controller.js';
import { protect, protectPartner } from '../../../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/login', clientLogin);

// Partner routes
router.post('/partner/:id/generate-access', protectPartner, generateClientPortalAccess);
router.post('/partner/:id/revoke-access', protectPartner, revokeClientPortalAccess);
router.get('/partner/clients', protectPartner, getPartnerClients);

export default router;