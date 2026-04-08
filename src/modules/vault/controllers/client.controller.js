import Client from '../models/Client.js';
import Partner from '../models/Partner.js';
import VaultAgent from '../models/Agent.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { createToken } from '../../../middleware/auth.js';
import { Role } from '../../../modules/auth/models/role/role.model.js';

/* =====================================
   CLIENT LOGIN (Portal)
===================================== */
export const clientLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const client = await Client.findOne({ email, isDeleted: false }).populate('role');
    if (!client) return res.status(401).json({ success: false, message: "Invalid credentials" });
    if (!client.portalAccess.hasAccess || client.portalAccess.isRevoked) {
      return res.status(403).json({ success: false, message: "Portal access not granted or revoked" });
    }
    
    const isMatch = await bcrypt.compare(password, client.password);
    if (!isMatch) return res.status(401).json({ success: false, message: "Invalid credentials" });
    
    client.lastLoginAt = new Date();
    await client.save();
    
    const token = createToken(client);
    return res.status(200).json({ success: true, message: "Login successful", token, data: client });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GENERATE CLIENT PORTAL ACCESS (Partner/Agent)
===================================== */
export const generateClientPortalAccess = async (req, res) => {
  try {
    const { id } = req.params;
    const client = await Client.findById(id);
    if (!client) return res.status(404).json({ success: false, message: "Client not found" });
    
    const tempPassword = crypto.randomBytes(8).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    
    client.password = hashedPassword;
    client.portalAccess.hasAccess = true;
    client.portalAccess.tempPassword = tempPassword;
    client.portalAccess.isPasswordChanged = false;
    client.portalAccess.accessGeneratedAt = new Date();
    client.portalAccess.accessGeneratedBy = req.user._id;
    client.portalAccess.generatedByType = req.user.agentType === 'FreelanceAgent' ? 'Agent' : 'Partner';
    await client.save();
    
    return res.status(200).json({ success: true, message: "Portal access generated", data: { tempPassword, email: client.email } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   REVOKE CLIENT PORTAL ACCESS
===================================== */
export const revokeClientPortalAccess = async (req, res) => {
  try {
    const { id } = req.params;
    const client = await Client.findById(id);
    if (!client) return res.status(404).json({ success: false, message: "Client not found" });
    
    client.portalAccess.isRevoked = true;
    client.portalAccess.revokedAt = new Date();
    client.portalAccess.revokedBy = req.user._id;
    client.portalAccess.revokedByType = req.user.agentType === 'FreelanceAgent' ? 'Agent' : 'Partner';
    await client.save();
    
    return res.status(200).json({ success: true, message: "Portal access revoked" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET PARTNER CLIENTS
===================================== */
export const getPartnerClients = async (req, res) => {
  try {
    const partnerId = req.user._id;
    const clients = await Client.find({ partnerId, isDeleted: false });
    return res.status(200).json({ success: true, data: clients });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export default { clientLogin, generateClientPortalAccess, revokeClientPortalAccess, getPartnerClients };