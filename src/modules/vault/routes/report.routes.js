import express from 'express';
import { getAdminReports, exportAdminReport } from '../controllers/report.controller.js';
import { protect } from '../../../middleware/auth.js';

const router = express.Router();

// Helper middleware to restrict to Admin (role code '18')
const isAdmin = async (req, res, next) => {
  try {
    const Role = (await import('../../../modules/auth/models/role/role.model.js')).Role;
    let roleCode = req.user?.role?.code;
    if (!roleCode) {
      const roleId = req.user?.role?._id || req.user?.role;
      if (roleId) {
        const roleDoc = await Role.findById(roleId);
        roleCode = roleDoc?.code;
      }
    }
    if (roleCode === '18') return next();
    return res.status(403).json({ success: false, message: 'Admin access required' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

router.use(protect);
router.use(isAdmin);

router.get('/',        getAdminReports);
router.get('/export',  exportAdminReport);

module.exports = router;
