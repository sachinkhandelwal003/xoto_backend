import express from 'express';
import { getVaultCustomers, getVaultCustomerProfile, getCustomerLeads } from '../controllers/customer.vault.controller.js';
import { protectMulti } from '../../../middleware/auth.js';

const router = express.Router();

router.use(protectMulti);

router.get('/',           getVaultCustomers);
router.get('/:id',        getVaultCustomerProfile);
router.get('/:id/leads',  getCustomerLeads);

module.exports = router;
