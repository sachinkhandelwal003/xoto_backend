// controllers/mortgageOps.controller.js
import MortgageOps from '../models/MortgageOps.js';
import XotoAdvisor from '../models/XotoAdvisor.js';
import Case from '../models/Case.js';
import VaultLead from '../models/VaultLead.js';
import Commission from '../models/Commission.js';
import HistoryService from '../services/history.service.js';
import bcrypt from 'bcryptjs';
import { Role } from '../../../modules/auth/models/role/role.model.js';
import { createToken } from '../../../middleware/auth.js';
import { logAudit } from '../services/auditLog.service.js';
import { emitVaultNotification } from '../services/vaultNotification.service.js';
import sendEmail from '../../../utils/sendEmail.js';

const credentialEmailHtml = (name, email, password, role) => `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f9f9f9;">
  <div style="background:#5C039B;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:22px;">Xoto Vault</h1>
  </div>
  <div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;">
    <h2 style="color:#111;margin-top:0;">Welcome, ${name}!</h2>
    <p style="color:#555;">Your <strong>${role}</strong> account on Xoto Vault has been created by the admin. Your login credentials are below:</p>
    <div style="background:#F5F0FF;border:1px solid #E9D5FF;border-radius:8px;padding:16px;margin:24px 0;">
      <p style="margin:0 0 8px;"><strong>Email:</strong> ${email}</p>
      <p style="margin:0;"><strong>Password:</strong> ${password}</p>
    </div>
    <p style="color:#c0392b;font-size:13px;"><strong>Important:</strong> Log in and change your password immediately.</p>
    <p style="color:#555;margin-bottom:0;">— Xoto Vault Team</p>
  </div>
</div>`;

/* =====================================
   HELPER FUNCTION
===================================== */
const getUserInfo = async (req, user = null) => {
  let userRole = 'System';
  
  try {
    const roleId = req.user?.role;
    if (roleId) {
      const roleDoc = await Role.findById(roleId);
      const roleCode = roleDoc?.code;
      
      if (roleCode === '18') {
        userRole = 'Admin';
      } else if (roleCode === '21') {
        userRole = 'Partner';
      } else if (req.user?.employeeType === 'MortgageOps') {
        userRole = 'MortgageOps';
      } else if (req.user?.employeeType === 'XotoAdvisor') {
        userRole = 'XotoAdvisor';
      }
    }
  } catch (error) {
    console.error("Error getting user role:", error);
  }
  
  return {
    userId: user?._id || req.user?._id,
    userRole: userRole,
    userName: user?.fullName || user?.name || user?.email || req.user?.fullName || req.user?.email || 'System',
    userEmail: user?.email || req.user?.email || null,
    ipAddress: req?.ip || null,
    userAgent: req?.headers?.['user-agent'] || null,
  };
};

/* =====================================
   1. ADMIN CREATE MORTGAGE OPS
===================================== */
export const createMortgageOps = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const {
      first_name, last_name, email, phone_number, country_code, password,
      dateOfBirth, nationality, gender, joinDate, maxCapacity,profilePic
    } = req.body;

    if (!first_name || !last_name || !email || !phone_number || !password) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, email, phone number and password are required"
      });
    }

    // Get Role for Mortgage Ops
    const opsRole = await Role.findOne({ name: 'Vault-Mortgage-Ops', code: '23' });
    if (!opsRole) {
      return res.status(404).json({ success: false, message: "Mortgage Ops role not found" });
    }

    // Check duplicates
    const existingEmail = await MortgageOps.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ success: false, message: "Email already registered" });
    }

    const existingPhone = await MortgageOps.findOne({ 'phone.number': phone_number });
    if (existingPhone) {
      return res.status(400).json({ success: false, message: "Phone number already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate employee code
    const count = await MortgageOps.countDocuments();
    const employeeCode = `OPS-${String(count + 1).padStart(4, '0')}`;

    const ops = await MortgageOps.create({
      name: { first_name, last_name },
      email,
      phone: { country_code: country_code || '+971', number: phone_number },
      password: hashedPassword,
      employeeCode,
      profilePic: profilePic || null,  // 👈 ADD THIS
      role: opsRole._id,
      dateOfBirth: dateOfBirth || null,
      nationality: nationality || null,
      gender: gender || null,
      joinDate: joinDate || new Date(),
      workload: { maxCapacity: maxCapacity || 30 },
      isActive: true,
      isVerified: true,
      verifiedAt: new Date(),
      verifiedBy: req.user._id
    });

    // Log Audit
    await logAudit({
      entityType: 'USER',
      entityId: ops._id,
      action: 'USER_CREATED',
      performedBy: req.user._id,
      performedByName: req.user.email,
      performedByRole: 'admin',
      visibleToRoles: ['admin', 'ops'],
      metadata: { department: ops.department, designation: ops.designation, employeeCode }
    });

    await HistoryService.logEmployeeActivity(ops, 'OPS_CREATED', await getUserInfo(req), {
      description: `Mortgage Ops ${ops.fullName} created`,
      metadata: { createdBy: req.user?.email, employeeCode }
    });

    try {
      await sendEmail({
        to: email,
        subject: 'Your Xoto Vault Mortgage Ops Account Credentials',
        html: credentialEmailHtml(`${first_name} ${last_name}`, email, password, 'Mortgage Ops'),
      });
    } catch (emailErr) {
      console.error('Credential email failed (ops):', emailErr.message);
    }

    const opsResponse = ops.toObject();
    delete opsResponse.password;

    return res.status(201).json({
      success: true,
      message: "Mortgage Ops created successfully",
      data: opsResponse
    });

  } catch (error) {
    console.error("Create ops error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   2. ADMIN GET ALL MORTGAGE OPS
===================================== */
export const getAllMortgageOps = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { isActive, status, search, department } = req.query;

    let query = { isDeleted: false };
    
    // Handle status filter
    if (status) {
      if (status === 'active') {
        query.isActive = true;
        query.suspendedAt = null;
      } else if (status === 'suspended') {
        query.suspendedAt = { $ne: null };
      } else if (status === 'inactive') {
        query.isActive = false;
        query.suspendedAt = null;
      }
    }
    
    // Handle isActive filter (backward compatibility)
    if (isActive !== undefined && !status) {
      query.isActive = isActive === 'true';
    }
    
    // Handle department filter
    if (department && department !== 'all') {
      query.department = department;
    }
    
    // Handle search
    if (search) {
      query.$or = [
        { 'name.first_name': { $regex: search, $options: 'i' } },
        { 'name.last_name': { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeCode: { $regex: search, $options: 'i' } }
      ];
    }

    const opsList = await MortgageOps.find(query)
      .select('-password')
      .populate('role', 'name code')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await MortgageOps.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: opsList,
      total,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalItems: total,
        limit
      }
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET MORTGAGE OPS BY ID (Admin only)
===================================== */
export const getMortgageOpsById = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const { id } = req.params;

    const ops = await MortgageOps.findById(id)
      .select('-password')
      .populate('role', 'name code');

    if (!ops) {
      return res.status(404).json({ success: false, message: "Mortgage Ops not found" });
    }

    return res.status(200).json({
      success: true,
      data: ops
    });

  } catch (error) {
    console.error("getMortgageOpsById error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
/* =====================================
   3. ADMIN GET OPS WORKLOAD
===================================== */
export const getOpsWorkload = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const opsList = await MortgageOps.find({ isActive: true, isDeleted: false })
      .select('name employeeCode workload performanceMetrics');

    const workloadSummary = opsList.map(op => ({
      id: op._id,
      name: op.fullName,
      employeeCode: op.employeeCode,
      currentApplications: op.workload.currentApplications,
      maxCapacity: op.workload.maxCapacity,
      utilization: (op.workload.currentApplications / op.workload.maxCapacity) * 100,
      canTakeMore: op.workload.currentApplications < op.workload.maxCapacity,
      avgProcessingDays: op.performanceMetrics.averageTurnaroundDays,
      returnRate: op.performanceMetrics.returnRate
    }));

    return res.status(200).json({
      success: true,
      data: workloadSummary
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   4. ADMIN ASSIGN CASE TO OPS
===================================== */
export const assignCaseToOps = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const { opsId, caseId } = req.body;

    const ops = await MortgageOps.findById(opsId);
    if (!ops || !ops.isActiveOps()) {
      return res.status(404).json({ success: false, message: "Mortgage Ops not found or inactive" });
    }

    if (!ops.canTakeMoreApplications()) {
      return res.status(400).json({
        success: false,
        message: `Ops ${ops.fullName} is at max capacity (${ops.workload.currentApplications}/${ops.workload.maxCapacity})`
      });
    }

    const caseData = await Case.findById(caseId);
    if (!caseData || caseData.isDeleted) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }

    // Update case with ops assignment
    caseData.assignedTo = {
      opsId: ops._id,
      opsName: ops.fullName,
      assignedAt: new Date(),
      assignedBy: req.user._id
    };
    caseData.currentStatus = 'Assigned - Pending Review';
    await caseData.save();

    // Update ops workload
    ops.workload.currentApplications += 1;
    ops.queueStatus.pendingReview += 1;
    await ops.save();

    await HistoryService.logCaseActivity(caseData, 'CASE_ASSIGNED_TO_OPS', await getUserInfo(req), {
      description: `Case assigned to ops ${ops.fullName}`,
      metadata: { opsId, caseId }
    });

    // Log Audit
    await logAudit({
      entityType: 'CASE',
      entityId: caseData._id,
      entityRef: caseData.caseReference,
      action: 'CASE_ASSIGNED_TO_OPS',
      newValue: { opsId: ops._id, opsName: ops.fullName },
      performedBy: req.user._id,
      performedByName: req.user.email,
      performedByRole: 'admin',
      visibleToRoles: ['admin', 'ops'],
      metadata: { opsId: ops._id.toString() }
    });

    // Notify Specific Mortgage Ops (Trigger #30)
    await emitVaultNotification({
      eventType: 'CASE_ASSIGNED_TO_OPS',
      title: 'Application Assigned',
      message: `Application ${caseData.caseReference} has been manually assigned to you by Admin.`,
      entityId: caseData._id,
      entityModel: 'Case',
      recipientId: ops._id,
      recipientModel: 'MortgageOps',
      recipientRole: 'ops',
      createdByName: 'Xoto Admin',
      createdByRole: 'admin',
    });

    // Notify Partner Admin / Creator (Trigger #11)
    if (caseData.createdBy?.role === 'partner' && caseData.partnerId) {
      await emitVaultNotification({
        eventType: 'CASE_STATUS_UPDATED',
        title: 'Application Under Review',
        message: `Your application ${caseData.caseReference} is now assigned to Operations Executive ${ops.fullName}.`,
        entityId: caseData._id,
        entityModel: 'Case',
        recipientId: caseData.partnerId,
        recipientModel: 'Partner',
        recipientRole: 'partner',
        createdByName: 'Xoto Admin',
        createdByRole: 'admin',
      });
    } else if (caseData.createdBy?.userId) {
      await emitVaultNotification({
        eventType: 'CASE_STATUS_UPDATED',
        title: 'Application Under Review',
        message: `Your application ${caseData.caseReference} is now assigned to Operations Executive ${ops.fullName}.`,
        entityId: caseData._id,
        entityModel: 'Case',
        recipientId: caseData.createdBy.userId,
        recipientModel: caseData.createdBy.role === 'advisor' ? 'XotoAdvisor' : 'Agent',
        recipientRole: caseData.createdBy.role,
        createdByName: 'Xoto Admin',
        createdByRole: 'admin',
      });
    }

    return res.status(200).json({
      success: true,
      message: `Case assigned to ${ops.fullName}`,
      data: {
        opsName: ops.fullName,
        currentWorkload: ops.workload.currentApplications,
        caseStatus: caseData.currentStatus
      }
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   5. MORTGAGE OPS LOGIN
===================================== */
export const opsLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password required" });
    }

    const ops = await MortgageOps.findOne({ email })
      .select('+password')
      .populate('role');

    if (!ops) {
      await logAudit({
        entityType: 'USER',
        action: 'USER_FAILED_LOGIN',
        performedByName: email,
        performedByRole: 'ops',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        visibleToRoles: ['admin'],
        metadata: { reason: 'Ops email not found' }
      });
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, ops.password);
    if (!isMatch) {
      await logAudit({
        entityType: 'USER',
        entityId: ops._id,
        action: 'USER_FAILED_LOGIN',
        performedBy: ops._id,
        performedByName: ops.fullName || email,
        performedByRole: 'ops',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        visibleToRoles: ['admin', 'ops'],
        metadata: { reason: 'Password mismatch' }
      });
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    if (!ops.isActiveOps()) {
      await logAudit({
        entityType: 'USER',
        entityId: ops._id,
        action: 'USER_FAILED_LOGIN',
        performedBy: ops._id,
        performedByName: ops.fullName || email,
        performedByRole: 'ops',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        visibleToRoles: ['admin', 'ops'],
        metadata: { reason: 'Ops user suspended/inactive' }
      });
      return res.status(403).json({ success: false, message: "Account is deactivated or suspended" });
    }

    ops.lastLoginAt = new Date();
    await ops.save();

    await logAudit({
      entityType: 'USER',
      entityId: ops._id,
      action: 'USER_LOGIN',
      performedBy: ops._id,
      performedByName: ops.fullName || email,
      performedByRole: 'ops',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      visibleToRoles: ['admin', 'ops'],
    });

    const token = createToken(ops);
    const opsResponse = ops.toObject();
    delete opsResponse.password;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      data: opsResponse
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   6. MORTGAGE OPS GET ASSIGNED CASES
===================================== */
export const getMyCases = async (req, res) => {
  try {
    const opsId = req.user._id;

    const cases = await Case.find({
      'assignedTo.opsId': opsId,
      isDeleted: false
    }).sort({ createdAt: -1 });

    const summary = {
      total: cases.length,
      pendingReview: cases.filter(c => c.currentStatus === 'Assigned - Pending Review').length,
      inProgress: cases.filter(c => c.currentStatus === 'Under Review').length,
      waitingBank: cases.filter(c => c.currentStatus === 'Submitted to Bank').length,
      completed: cases.filter(c => c.currentStatus === 'Disbursed').length
    };

    return res.status(200).json({
      success: true,
      summary,
      data: cases
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   7. MORTGAGE OPS GET OPS QUEUE (All unassigned)
===================================== */
export const getOpsQueue = async (req, res) => {
  try {
    const cases = await Case.find({
      currentStatus: 'In Ops Queue - Pending Pick-up',
      isDeleted: false
    }).sort({ createdAt: 1 }); // Oldest first

    return res.status(200).json({
      success: true,
      count: cases.length,
      data: cases
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   8. MORTGAGE OPS PICK UP CASE FROM QUEUE
===================================== */
export const pickUpCase = async (req, res) => {
  try {
    const { caseId } = req.params;
    const opsId = req.user._id;

    const ops = await MortgageOps.findById(opsId);
    if (!ops || !ops.isActiveOps()) {
      return res.status(404).json({ success: false, message: "Ops not found" });
    }

    const caseData = await Case.findOne({
      _id: caseId,
      currentStatus: 'In Ops Queue - Pending Pick-up',
      isDeleted: false
    });

    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found or already picked up" });
    }

    caseData.assignedTo = {
      opsId: ops._id,
      opsName: ops.fullName,
      assignedAt: new Date()
    };
    caseData.currentStatus = 'Assigned - Pending Review';
    await caseData.save();

    ops.workload.currentApplications += 1;
    ops.queueStatus.pendingReview += 1;
    await ops.save();

    // Log Audit
    await logAudit({
      entityType: 'CASE',
      entityId: caseData._id,
      entityRef: caseData.caseReference,
      action: 'CASE_PICKED_UP',
      newValue: { opsId: ops._id, opsName: ops.fullName },
      performedBy: ops._id,
      performedByName: ops.fullName,
      performedByRole: 'ops',
      visibleToRoles: ['admin', 'ops'],
      metadata: { opsId: ops._id.toString() }
    });

    // Notify Admin
    await emitVaultNotification({
      eventType: 'CASE_PICKED_UP',
      title: 'Application Picked Up',
      message: `Application ${caseData.caseReference} has been picked up by Operations Executive ${ops.fullName}.`,
      entityId: caseData._id,
      entityModel: 'Case',
      recipientRole: 'admin',
      sendToAllOfRole: true,
      createdByName: ops.fullName,
      createdByRole: 'ops',
    });

    // Notify Submitter
    if (caseData.createdBy?.role === 'partner' && caseData.partnerId) {
      await emitVaultNotification({
        eventType: 'CASE_STATUS_UPDATED',
        title: 'Application Under Review',
        message: `Your application ${caseData.caseReference} has been picked up for review.`,
        entityId: caseData._id,
        entityModel: 'Case',
        recipientId: caseData.partnerId,
        recipientModel: 'Partner',
        recipientRole: 'partner',
        createdByName: ops.fullName,
        createdByRole: 'ops',
      });
    } else if (caseData.createdBy?.userId) {
      await emitVaultNotification({
        eventType: 'CASE_STATUS_UPDATED',
        title: 'Application Under Review',
        message: `Your application ${caseData.caseReference} has been picked up for review.`,
        entityId: caseData._id,
        entityModel: 'Case',
        recipientId: caseData.createdBy.userId,
        recipientModel: caseData.createdBy.role === 'advisor' ? 'XotoAdvisor' : 'Agent',
        recipientRole: caseData.createdBy.role,
        createdByName: ops.fullName,
        createdByRole: 'ops',
      });
    }

    return res.status(200).json({
      success: true,
      message: "Case picked up successfully",
      data: caseData
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   9. MORTGAGE OPS UPDATE CASE STATUS
===================================== */
export const updateCaseStatus = async (req, res) => {
  try {
    const { caseId } = req.params;
    const { status, notes } = req.body;
    const opsId = req.user._id;

    const caseData = await Case.findOne({
      _id: caseId,
      'assignedTo.opsId': opsId,
      isDeleted: false
    });

    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found or not assigned to you" });
    }

    const validStatuses = [
      'Assigned - Pending Review', 'Under Review', 'Returned - Pending Correction',
      'Submitted to Bank', 'Pre-Approved', 'Valuation', 'FOL Processed',
      'FOL Issued', 'FOL Signed', 'Disbursed', 'Rejected'
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const previousStatus = caseData.currentStatus;
    caseData.currentStatus = status;
    if (notes) caseData.internalNotes.push({ note: notes, addedBy: req.user.fullName, addedAt: new Date() });
    await caseData.save();

    // Log Audit
    await logAudit({
      entityType: 'CASE',
      entityId: caseData._id,
      entityRef: caseData.caseReference,
      action: 'CASE_STATUS_CHANGED',
      oldValue: previousStatus,
      newValue: status,
      performedBy: ops._id,
      performedByName: ops.fullName,
      performedByRole: 'ops',
      visibleToRoles: ['admin', 'ops', 'partner', 'advisor', 'referral_partner', 'partner_affiliated_agent'],
      metadata: { previousStatus, newStatus: status, notes }
    });

    // Notify Submitter (Partner / Advisor / Agent)
    const notificationTitle = `Application Status: ${status}`;
    const notificationMessage = `Application ${caseData.caseReference} status has been updated to "${status}".`;

    if (caseData.createdBy?.role === 'partner' && caseData.partnerId) {
      await emitVaultNotification({
        eventType: status === 'Returned - Pending Correction' ? 'CASE_RETURNED' : 'CASE_STATUS_UPDATED',
        title: notificationTitle,
        message: notificationMessage,
        entityId: caseData._id,
        entityModel: 'Case',
        recipientId: caseData.partnerId,
        recipientModel: 'Partner',
        recipientRole: 'partner',
        createdByName: ops.fullName,
        createdByRole: 'ops',
      });
    } else if (caseData.createdBy?.userId) {
      await emitVaultNotification({
        eventType: status === 'Returned - Pending Correction' ? 'CASE_RETURNED' : 'CASE_STATUS_UPDATED',
        title: notificationTitle,
        message: notificationMessage,
        entityId: caseData._id,
        entityModel: 'Case',
        recipientId: caseData.createdBy.userId,
        recipientModel: caseData.createdBy.role === 'advisor' ? 'XotoAdvisor' : 'Agent',
        recipientRole: caseData.createdBy.role,
        createdByName: ops.fullName,
        createdByRole: 'ops',
      });
    }

    // Auto-create Commission on Disbursed
    if (status === 'Disbursed') {
      const existingComm = await Commission.findOne({ sourceId: caseData._id, sourceType: 'Case' });
      if (!existingComm) {
        const propertyValue = caseData.clientInfo?.propertyValue || 0;
        const isAboveFiveM = propertyValue > 5000000;
        
        let recipientType = 'Partner';
        let recipientId = caseData.partnerId;
        let commissionPercentage = 75;

        if (caseData.createdBy?.role === 'referral_partner') {
          recipientType = 'ReferralPartner';
          recipientId = caseData.createdBy.userId;
          commissionPercentage = 2; // Default 2% for Referral Partner
        } else if (caseData.partnerId) {
          const partner = await Partner.findById(caseData.partnerId);
          commissionPercentage = isAboveFiveM
            ? partner?.commissionTier?.aboveFiveMillion || 80
            : partner?.commissionTier?.upToFiveMillion || 75;
        }

        await Commission.create({
          recipientType,
          recipientId,
          sourceType: 'Case',
          sourceId: caseData._id,
          clientId: caseData.clientId,
          propertyValue,
          commissionPercentage,
          status: 'Pending',
          notes: 'Auto-created commission on Disbursed. Admin verification required.',
        });

        // Notify Admin that commission is pending confirmation
        await emitVaultNotification({
          eventType: 'COMMISSION_CREATED',
          title: 'New Commission Pending',
          message: `Application ${caseData.caseReference} disbursed. Commission calculation is pending Admin confirmation.`,
          entityId: caseData._id,
          entityModel: 'Case',
          recipientRole: 'admin',
          sendToAllOfRole: true,
          createdByName: 'System',
          createdByRole: 'system',
        });
      }
    }

    // Update ops performance metrics
    const ops = await MortgageOps.findById(opsId);
    if (status === 'Disbursed') {
      ops.performanceMetrics.totalDisbursed += 1;
      ops.workload.currentApplications -= 1;
      ops.queueStatus.pendingReview -= 1;
    }
    if (status === 'Returned - Pending Correction') {
      ops.performanceMetrics.totalApplicationsReturned += 1;
    }
    if (status === 'Submitted to Bank') {
      ops.performanceMetrics.totalBankSubmissions += 1;
      ops.queueStatus.waitingBank += 1;
      ops.queueStatus.pendingReview -= 1;
    }
    await ops.save();

    return res.status(200).json({
      success: true,
      message: "Case status updated successfully",
      data: caseData
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   10. MORTGAGE OPS GET DASHBOARD
===================================== */
export const getOpsDashboard = async (req, res) => {
  try {
    const opsId = req.user._id;
    const ops = await MortgageOps.findById(opsId);

    const assignedCases = await Case.find({
      'assignedTo.opsId': opsId,
      isDeleted: false
    });

    const queueCount = await Case.countDocuments({
      currentStatus: 'In Ops Queue - Pending Pick-up',
      isDeleted: false
    });

    return res.status(200).json({
      success: true,
      data: {
        profile: {
          name: ops.fullName,
          employeeCode: ops.employeeCode,
          currentWorkload: ops.workload.currentApplications,
          maxCapacity: ops.workload.maxCapacity
        },
        queue: {
          pendingPickup: queueCount
        },
        cases: {
          total: assignedCases.length,
          pendingReview: assignedCases.filter(c => c.currentStatus === 'Assigned - Pending Review').length,
          inProgress: assignedCases.filter(c => c.currentStatus === 'Under Review').length,
          submittedToBank: assignedCases.filter(c => c.currentStatus === 'Submitted to Bank').length,
          completed: assignedCases.filter(c => c.currentStatus === 'Disbursed').length
        },
        performance: ops.performanceMetrics
      }
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   11. SUSPEND/ACTIVATE/DELETE OPS
===================================== */
export const suspendOps = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const { id } = req.params;
    const { suspensionReason } = req.body;

    const ops = await MortgageOps.findById(id);
    if (!ops || ops.isDeleted) {
      return res.status(404).json({ success: false, message: "Mortgage Ops not found" });
    }

    ops.suspendedAt = new Date();
    ops.suspensionReason = suspensionReason || "Suspended by Admin";
    ops.isActive = false;
    await ops.save();

    // Return all active cases owned by this ops back to the queue
    const affectedCases = await Case.updateMany(
      {
        'opsQueue.pickedUpBy.opsId': ops._id,
        currentStatus: { $in: ['Assigned - Pending Review', 'Under Review'] },
        isDeleted: false,
      },
      {
        $set: {
          currentStatus: 'In Ops Queue - Pending Pick-up',
          'opsQueue.returnedToQueue': {
            returnedAt: new Date(),
            returnedBy: req.user._id,
            reason: `Ops user suspended by admin — cases returned to queue automatically`,
          },
        }
      }
    );

    return res.status(200).json({
      success: true,
      message: "Mortgage Ops suspended successfully",
      casesReturnedToQueue: affectedCases.modifiedCount,
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const activateOps = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const { id } = req.params;

    const ops = await MortgageOps.findById(id);
    if (!ops || ops.isDeleted) {
      return res.status(404).json({ success: false, message: "Mortgage Ops not found" });
    }

    ops.suspendedAt = null;
    ops.suspensionReason = null;
    ops.isActive = true;
    await ops.save();

    return res.status(200).json({ success: true, message: "Mortgage Ops activated successfully" });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteOps = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const { id } = req.params;

    const ops = await MortgageOps.findById(id);
    if (!ops || ops.isDeleted) {
      return res.status(404).json({ success: false, message: "Mortgage Ops not found" });
    }

    ops.isDeleted = true;
    ops.deletedAt = new Date();
    ops.isActive = false;
    await ops.save();

    return res.status(200).json({ success: true, message: "Mortgage Ops deleted successfully" });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   12. GET OPS PROFILE (Self)
===================================== */
export const getOpsProfile = async (req, res) => {
  try {
    const ops = await MortgageOps.findById(req.user._id)
      .select('-password')
      .populate('role', 'name code');

    if (!ops) {
      return res.status(404).json({ success: false, message: "Mortgage Ops not found" });
    }

    return res.status(200).json({ success: true, data: ops });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   13. CHANGE PASSWORD
===================================== */
export const changeOpsPassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const opsId = req.user._id;

    const ops = await MortgageOps.findById(opsId).select('+password');
    if (!ops) {
      return res.status(404).json({ success: false, message: "Mortgage Ops not found" });
    }

    const isMatch = await bcrypt.compare(oldPassword, ops.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Old password is incorrect" });
    }

    ops.password = await bcrypt.hash(newPassword, 10);
    await ops.save();

    return res.status(200).json({ success: true, message: "Password changed successfully" });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};