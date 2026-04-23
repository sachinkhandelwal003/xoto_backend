// controllers/xotoAdvisor.controller.js
import XotoAdvisor from '../models/XotoAdvisor.js';
import MortgageOps from '../models/MortgageOps.js';
import VaultLead from '../models/VaultLead.js';
import Case from '../models/Case.js';
import Commission from '../models/Commission.js';
import HistoryService from '../services/history.service.js';
import bcrypt from 'bcryptjs';
import { Role } from '../../../modules/auth/models/role/role.model.js';
import { createToken } from '../../../middleware/auth.js';

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
      } else if (req.user?.employeeType === 'XotoAdvisor') {
        userRole = 'XotoAdvisor';
      } else if (req.user?.employeeType === 'MortgageOps') {
        userRole = 'MortgageOps';
      } else {
        userRole = 'Employee';
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
   1. ADMIN CREATE XOTO ADVISOR
===================================== */
export const createXotoAdvisor = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const {
      first_name, last_name, email, phone_number, country_code, password,
      dateOfBirth, nationality, gender, joinDate, maxLeadsCapacity
    } = req.body;

    if (!first_name || !last_name || !email || !phone_number || !password) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, email, phone number and password are required"
      });
    }

    // Get Role for Xoto Advisor
    const advisorRole = await Role.findOne({ name: 'Vault-Advisor', code: '26' });
    if (!advisorRole) {
      return res.status(404).json({ success: false, message: "Vault Advisor role not found" });
    }

    // Check duplicates
    const existingEmail = await XotoAdvisor.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ success: false, message: "Email already registered" });
    }

    const existingPhone = await XotoAdvisor.findOne({ 'phone.number': phone_number });
    if (existingPhone) {
      return res.status(400).json({ success: false, message: "Phone number already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate employee code
    const count = await XotoAdvisor.countDocuments();

    const advisor = await XotoAdvisor.create({
      name: { first_name, last_name },
      email,
      phone: { country_code: country_code || '+971', number: phone_number },
      password: hashedPassword,
      role: advisorRole._id,
      dateOfBirth: dateOfBirth || null,
      nationality: nationality || null,
      gender: gender || null,
      joinDate: joinDate || new Date(),
      workload: { maxLeadsCapacity: maxLeadsCapacity || 20 },
      isActive: true,
      isVerified: true,
      verifiedAt: new Date(),
      verifiedBy: req.user._id
    });

    await HistoryService.logEmployeeActivity(advisor, 'ADVISOR_CREATED', await getUserInfo(req), {
      description: `Xoto Advisor ${advisor.fullName} created`,
      metadata: { createdBy: req.user?.email }
    });

    const advisorResponse = advisor.toObject();
    delete advisorResponse.password;

    return res.status(201).json({
      success: true,
      message: "Xoto Advisor created successfully",
      data: advisorResponse
    });

  } catch (error) {
    console.error("Create advisor error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   2. ADMIN GET ALL XOTO ADVISORS
===================================== */
// controllers/advisorController.js
export const getAllXotoAdvisors = async (req, res) => {
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
      ];
    }

    const advisors = await XotoAdvisor.find(query)
      .select('-password')
      .populate('role', 'name code')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await XotoAdvisor.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: advisors,
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
   GET XOTO ADVISOR BY ID (Admin only)
===================================== */
export const getXotoAdvisorById = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const { id } = req.params;

    const advisor = await XotoAdvisor.findById(id)
      .select('-password')
      .populate('role', 'name code');

    if (!advisor) {
      return res.status(404).json({ success: false, message: "Xoto Advisor not found" });
    }

    return res.status(200).json({
      success: true,
      data: advisor
    });

  } catch (error) {
    console.error("getXotoAdvisorById error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   3. ADMIN GET ADVISOR WORKLOAD (For Assignment)
===================================== */
export const getAdvisorWorkload = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const advisors = await XotoAdvisor.find({ isActive: true, isDeleted: false })
      .select('name  workload performanceMetrics');

    const workloadSummary = advisors.map(adv => ({
      id: adv._id,
      name: adv.fullName,
      currentLeads: adv.workload.currentLeads,
      maxCapacity: adv.workload.maxLeadsCapacity,
      utilization: (adv.workload.currentLeads / adv.workload.maxLeadsCapacity) * 100,
      canTakeMore: adv.workload.currentLeads < adv.workload.maxLeadsCapacity,
      conversionRate: adv.performanceMetrics.conversionRate,
      slaCompliance: adv.performanceMetrics.slaComplianceRate
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
   4. ADMIN ASSIGN LEAD TO ADVISOR
===================================== */
export const assignLeadToAdvisor = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const { advisorId, leadId } = req.body;

    const advisor = await XotoAdvisor.findById(advisorId);
    if (!advisor || !advisor.isActiveAdvisor()) {
      return res.status(404).json({ success: false, message: "Advisor not found or inactive" });
    }

    if (!advisor.canTakeMoreLeads()) {
      return res.status(400).json({
        success: false,
        message: `Advisor ${advisor.fullName} is at max capacity (${advisor.workload.currentLeads}/${advisor.workload.maxLeadsCapacity})`
      });
    }

    const lead = await VaultLead.findById(leadId);
    if (!lead || lead.isDeleted) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }

    // Update lead with advisor assignment
    lead.assignedTo = {
      advisorId: advisor._id,
      advisorName: advisor.fullName,
      assignedAt: new Date(),
      assignedBy: req.user._id
    };
    lead.slaDeadline = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours SLA
    await lead.save();

    // Update advisor workload
    advisor.workload.currentLeads += 1;
    advisor.performanceMetrics.totalLeadsAssigned += 1;
    await advisor.save();

    await HistoryService.logLeadActivity(lead, 'LEAD_ASSIGNED', await getUserInfo(req), {
      description: `Lead assigned to advisor ${advisor.fullName}`,
      metadata: { advisorId, leadId }
    });

    return res.status(200).json({
      success: true,
      message: `Lead assigned to ${advisor.fullName}`,
      data: {
        advisorName: advisor.fullName,
        currentWorkload: advisor.workload.currentLeads,
        slaDeadline: lead.slaDeadline
      }
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   5. XOTO ADVISOR LOGIN
===================================== */
export const advisorLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password required" });
    }

    const advisor = await XotoAdvisor.findOne({ email })
      .select('+password')
      .populate('role');

    if (!advisor) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, advisor.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    if (!advisor.isActiveAdvisor()) {
      return res.status(403).json({ success: false, message: "Account is deactivated or suspended" });
    }

    advisor.lastLoginAt = new Date();
    await advisor.save();

    await HistoryService.logSecurityEvent(advisor, 'LOGIN', await getUserInfo(req), {
      description: `Xoto Advisor ${advisor.fullName} logged in`,
    });

    const token = createToken(advisor);
    const advisorResponse = advisor.toObject();
    delete advisorResponse.password;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      data: advisorResponse
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   6. XOTO ADVISOR GET ASSIGNED LEADS
===================================== */
export const getMyLeads = async (req, res) => {
  try {
    const advisorId = req.user._id;

    const leads = await VaultLead.find({
      'assignedTo.advisorId': advisorId,
      isDeleted: false
    }).sort({ createdAt: -1 });

    const summary = {
      total: leads.length,
      new: leads.filter(l => l.currentStatus === 'New').length,
      contacted: leads.filter(l => l.currentStatus === 'Contacted').length,
      qualified: leads.filter(l => l.currentStatus === 'Qualified').length,
      converted: leads.filter(l => l.conversionInfo?.convertedToCase === true).length
    };

    return res.status(200).json({
      success: true,
      summary,
      data: leads
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   7. XOTO ADVISOR UPDATE LEAD STATUS
===================================== */
export const updateLeadStatus = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { status, notes } = req.body;

    const advisorId = req.user._id;

    const lead = await VaultLead.findOne({
      _id: leadId,
      'assignedTo.advisorId': advisorId,
      isDeleted: false
    });

    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found or not assigned to you" });
    }

    const validStatuses = ['New', 'Contacted', 'Qualified', 'Collecting Documentation', 'Not Proceeding'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    lead.currentStatus = status;
    if (notes) lead.notesToXoto = notes;
    
    // Track SLA compliance
    if (status === 'Contacted' && lead.slaDeadline && new Date() <= lead.slaDeadline) {
      // Update advisor SLA compliance
      const advisor = await XotoAdvisor.findById(advisorId);
      if (advisor) {
        // Calculate new SLA compliance rate
        const totalLeads = advisor.performanceMetrics.totalLeadsAssigned;
        const compliantLeads = (advisor.performanceMetrics.slaComplianceRate / 100) * totalLeads + 1;
        advisor.performanceMetrics.slaComplianceRate = (compliantLeads / (totalLeads + 1)) * 100;
        await advisor.save();
      }
    }

    await lead.save();

    await HistoryService.logLeadActivity(lead, 'LEAD_STATUS_UPDATED', await getUserInfo(req), {
      description: `Lead status updated to ${status}`,
      metadata: { previousStatus: lead.currentStatus, newStatus: status }
    });

    return res.status(200).json({
      success: true,
      message: "Lead status updated successfully",
      data: lead
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   8. XOTO ADVISOR GET DASHBOARD
===================================== */
export const getAdvisorDashboard = async (req, res) => {
  try {
    const advisorId = req.user._id;
    const advisor = await XotoAdvisor.findById(advisorId);

    const leads = await VaultLead.find({
      'assignedTo.advisorId': advisorId,
      isDeleted: false
    });

    const cases = await Case.find({
      'createdBy.advisorId': advisorId,
      isDeleted: false
    });

    const commissions = await Commission.find({
      sourceAgentId: advisorId,
      isDeleted: false
    });

    const totalLeads = leads.length;
    const contactedLeads = leads.filter(l => l.currentStatus === 'Contacted').length;
    const qualifiedLeads = leads.filter(l => l.currentStatus === 'Qualified').length;
    const convertedLeads = leads.filter(l => l.conversionInfo?.convertedToCase === true).length;

    return res.status(200).json({
      success: true,
      data: {
        profile: {
          name: advisor.fullName,
          currentWorkload: advisor.workload.currentLeads,
          maxCapacity: advisor.workload.maxLeadsCapacity
        },
        leads: {
          total: totalLeads,
          contacted: contactedLeads,
          qualified: qualifiedLeads,
          converted: convertedLeads,
          conversionRate: totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0
        },
        cases: {
          total: cases.length,
          active: cases.filter(c => !['Disbursed', 'Rejected'].includes(c.currentStatus)).length,
          completed: cases.filter(c => c.currentStatus === 'Disbursed').length
        },
        commissions: {
          totalEarned: commissions.filter(c => c.status === 'Paid').reduce((sum, c) => sum + c.commissionAmount, 0),
          pending: commissions.filter(c => ['Pending', 'Confirmed'].includes(c.status)).reduce((sum, c) => sum + c.commissionAmount, 0)
        },
        performance: advisor.performanceMetrics
      }
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   9. SUSPEND/ACTIVATE/DELETE ADVISOR
===================================== */
export const suspendAdvisor = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const { id } = req.params;
    const { suspensionReason } = req.body;

    const advisor = await XotoAdvisor.findById(id);
    if (!advisor || advisor.isDeleted) {
      return res.status(404).json({ success: false, message: "Advisor not found" });
    }

    advisor.suspendedAt = new Date();
    advisor.suspensionReason = suspensionReason || "Suspended by Admin";
    advisor.isActive = false;
    await advisor.save();

    return res.status(200).json({ success: true, message: "Advisor suspended successfully" });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const activateAdvisor = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const { id } = req.params;

    const advisor = await XotoAdvisor.findById(id);
    if (!advisor || advisor.isDeleted) {
      return res.status(404).json({ success: false, message: "Advisor not found" });
    }

    advisor.suspendedAt = null;
    advisor.suspensionReason = null;
    advisor.isActive = true;
    await advisor.save();

    return res.status(200).json({ success: true, message: "Advisor activated successfully" });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteAdvisor = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const { id } = req.params;

    const advisor = await XotoAdvisor.findById(id);
    if (!advisor || advisor.isDeleted) {
      return res.status(404).json({ success: false, message: "Advisor not found" });
    }

    advisor.isDeleted = true;
    advisor.deletedAt = new Date();
    advisor.isActive = false;
    await advisor.save();

    return res.status(200).json({ success: true, message: "Advisor deleted successfully" });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   10. GET ADVISOR PROFILE (Self)
===================================== */
export const getAdvisorProfile = async (req, res) => {
  try {
    const advisor = await XotoAdvisor.findById(req.user._id)
      .select('-password')
      .populate('role', 'name code');

    if (!advisor) {
      return res.status(404).json({ success: false, message: "Advisor not found" });
    }

    return res.status(200).json({ success: true, data: advisor });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   11. UPDATE ADVISOR PROFILE (Self)
===================================== */
export const updateAdvisorProfile = async (req, res) => {
  try {
    const advisorId = req.user._id;

    const allowedFields = ['profilePic', 'phone', 'nationality'];
    const updates = {};

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const updatedAdvisor = await XotoAdvisor.findByIdAndUpdate(
      advisorId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: updatedAdvisor
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   12. CHANGE PASSWORD
===================================== */
export const changeAdvisorPassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const advisorId = req.user._id;

    const advisor = await XotoAdvisor.findById(advisorId).select('+password');
    if (!advisor) {
      return res.status(404).json({ success: false, message: "Advisor not found" });
    }

    const isMatch = await bcrypt.compare(oldPassword, advisor.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Old password is incorrect" });
    }

    advisor.password = await bcrypt.hash(newPassword, 10);
    await advisor.save();

    return res.status(200).json({ success: true, message: "Password changed successfully" });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};