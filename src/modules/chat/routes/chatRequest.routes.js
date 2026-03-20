const router  = require("express").Router();
const { protectMulti } = require("../../../middleware/auth");
const ctrl    = require("../controllers/chatRequest.controller");

// ── Agent routes ─────────────────────────────────────────────
router.post("/request",             protectMulti, ctrl.createRequest);
router.get("/my-requests",          protectMulti, ctrl.getMyRequests);
router.get("/check-approval",       protectMulti, ctrl.checkApproval);

// ── Developer routes ─────────────────────────────────────────
router.get("/developer-approved",   protectMulti, ctrl.getDeveloperApproved);

// ── Admin routes ─────────────────────────────────────────────
router.get("/all-requests",         protectMulti, ctrl.getAllRequests);
router.put("/approve/:id",          protectMulti, ctrl.approveRequest);
router.put("/reject/:id",           protectMulti, ctrl.rejectRequest);

module.exports = router;