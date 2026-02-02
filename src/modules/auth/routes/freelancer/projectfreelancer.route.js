const router = require('express').Router();
const controller = require('../../controllers/freelancer/projectfreelancer.controller');
const { protectMulti, protectFreelancer, authorize } = require('../../../../middleware/auth');
const upload = require('../../../../middleware/multer');
const {
  validateCreateProject,
  validateAssignFreelancer,
  validateProjectId,
  validateMilestone,
  validateAddMilestone,
  validateDailyUpdate,
  validateApproveDaily
} = require('../../validations/freelancer/projectfreelancer.validation');

/**
 * ===================================================================
 * ROLE ACCESS LEGEND:
 * -------------------------------------------------------------------
 * ✅ SuperAdmin      → Full access (bypasses all checks)
 * ✅ Admin           → Can manage projects, milestones, approvals
 * ✅ Freelancer      → Can view own projects, submit daily updates
 * ✅ Client/Customer → Can create/assign projects
 * ===================================================================
 */

// ── FREELANCER: View own projects ────────────────────────────────
router.get(
  '/my',
  protectMulti,
  authorize({ roles: ['Freelancer','Accountant'] }),
  controller.getMyProjects
);
router.get(
  '/my/get',
  protectMulti,
  authorize({ roles: ['Accountant'] }),
  controller.getMyProjectsAccountant
);
// Access: Freelancer only

// ── ADMIN/SUPERADMIN: List all projects ───────────────────────────
router.get(
  '/',
  protectMulti,
  controller.getProjects
);
// Access: Admin, SuperAdmin

// ── FREELANCER: Add daily update to milestone ────────────────────
router.post(
  '/:id/milestones/:milestoneId/daily',
  protectMulti,
  authorize({ roles: ['Freelancer'] }),
  upload.array('photos', 10),
  validateDailyUpdate,
  controller.addDailyUpdate
);

router.post(
  '/update-milestone',
  controller.updateMilestoneById
);
// ── ADMIN/SUPERADMIN: Add milestone to project ────────────────────
router.post(
  '/:id/milestones',
  controller.addMilestone
);
// Access: Freelancer (on their assigned project)

// ── ANY AUTH USER: Get daily updates (for transparency) ───────────
router.get(
  '/:id/milestones/:milestoneId/daily',
  protectMulti,
  validateMilestone,
  controller.getDailyUpdates
);
// Access: Freelancer, Admin, SuperAdmin, Client (via protectMulti)

// ── SUPERADMIN/ADMIN: Approve daily update ───────────────────────
router.put(
  '/:id/milestones/:milestoneId/daily/:dailyId/approve',
  protectMulti,
  controller.approveDailyUpdate
);
// Access: Admin, SuperAdmin

// ── SUPERADMIN/ADMIN: Reject/challenge daily update ───────────────
router.put(
  '/:id/milestones/:milestoneId/daily/:dailyId/reject',
  protectMulti,
  controller.rejectDailyUpdate
);
// Access: Admin, SuperAdmin

// ── ADMIN/SUPERADMIN: Get all milestones of a project ─────────────
router.get(
  '/:id/milestones',
  protectMulti,
  authorize({ roles: ['admin', 'superadmin'] }),
  controller.getMilestones
);
// Access: Admin, SuperAdmin

// ── CLIENT/ADMIN: Create new project ──────────────────────────────
router.post(
  '/',
  protectMulti,
  upload.fields([
    { name: 'drawings_blueprints', maxCount: 10 },
    { name: 'visualization_3d', maxCount: 5 },
    { name: 'permits_documents', maxCount: 10 },
    { name: 'photos', maxCount: 10 }
  ]),
  validateCreateProject,
  authorize({ roles: ['customer', 'admin', 'superadmin'] }),
  controller.createProject
);
// Access: Customer (client), Admin, SuperAdmin


// Access: Admin, SuperAdmin

// ── ADMIN/SUPERADMIN: Assign freelancer to project ────────────────
router.post(
  '/:id/assign',
  protectMulti,
  validateAssignFreelancer,
  authorize({ roles: ['admin', 'superadmin'] }),
  controller.assignFreelancer
);
router.post(
  '/:id/move',
  protectMulti,
  authorize({ roles: ['admin', 'superadmin'] }),
  controller.moveProjectToAccountant
);
// Access: Admin, SuperAdmin

// ── ADMIN/SUPERADMIN: Get project details (admin view) ────────────
router.get(
  '/:id/admin',
  protectMulti,
  validateProjectId,
  authorize({ roles: ['admin', 'superadmin'] }),
  controller.getProjectAdmin
);
// Access: Admin, SuperAdmin

// ── FREELANCER: Request milestone payment release ─────────────────
router.post(
  '/:id/milestones/:milestoneId/release',
  protectMulti,
  validateMilestone,
  authorize({ roles: ['Freelancer'] }),
  controller.requestRelease
);
// Access: Freelancer only

// ── ADMIN/SUPERADMIN: Approve milestone completion ────────────────
router.put(
  '/:id/milestones/:milestoneId/approve',
  protectMulti,
  validateMilestone,
  authorize({ roles: ['admin', 'superadmin'] }),
  controller.approveMilestone
);
// Access: Admin, SuperAdmin

module.exports = router;