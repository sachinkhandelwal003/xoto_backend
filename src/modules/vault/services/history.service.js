const History = require('../models/VaultHistory');

class HistoryService {
  /**
   * Log a new history entry
   */
  static async log({
    entityType,
    entityId,
    entityName = null,
    action,
    previousStatus = null,
    newStatus = null,
    performedBy,
    changes = null,
    description,
    notes = null,
    ipAddress = null,
    userAgent = null,
    metadata = null,
    importance = 'MEDIUM',
    category = 'USER_ACTION',
  }) {
    try {
      return await History.log({
        entityType,
        entityId,
        entityName,
        action,
        previousStatus,
        newStatus,
        performedBy: {
          userId: performedBy.userId,
          userRole: performedBy.userRole,
          userName: performedBy.userName,
          userEmail: performedBy.userEmail || null,
          userType: performedBy.userType || null,
        },
        changes,
        description,
        notes,
        ipAddress,
        userAgent,
        metadata,
        importance,
        category,
      });
    } catch (error) {
      console.error('Failed to log history:', error);
      // Don't throw error - history logging should not break the main flow
      return null;
    }
  }

  /**
   * Log lead activity
   */
 /**
 * Log lead activity
 */
static async logLeadActivity(lead, action, userInfo, additionalData = {}) {
  // ✅ Use lead._id if leadId doesn't exist
  const entityId = lead.leadId || lead._id?.toString();
  
  if (!entityId) {
    console.error("Cannot log lead activity: missing entityId");
    return null;
  }
  
  return this.log({
    entityType: 'Lead',
    entityId: entityId,
    entityName: lead.customerInfo?.fullName,
    action,
    performedBy: userInfo,
    description: additionalData.description || `${action} performed on lead ${entityId}`,
    notes: additionalData.notes,
    ipAddress: userInfo.ipAddress,
    userAgent: userInfo.userAgent,
    metadata: {
      leadId: lead._id,
      customerName: lead.customerInfo?.fullName,
      propertyValue: lead.propertyDetails?.propertyValue,
      referralType: lead.referralType,
      ...additionalData.metadata,
    },
    ...additionalData,
  });
}

  /**
   * Log case activity
   */
/**
 * Log case activity
 */
static async logCaseActivity(caseData, action, userInfo, additionalData = {}) {
  // ✅ Use caseData._id if caseId doesn't exist
  const entityId = caseData.caseId || caseData._id?.toString();
  
  return this.log({
    entityType: 'Case',
    entityId: entityId,
    entityName: caseData.clientInfo?.fullName,
    action,
    performedBy: userInfo,
    description: additionalData.description || `${action} performed on case ${entityId}`,
    notes: additionalData.notes,
    ipAddress: userInfo.ipAddress,
    userAgent: userInfo.userAgent,
    metadata: {
      caseId: caseData._id,
      caseReference: caseData.caseReference,
      clientName: caseData.clientInfo?.fullName,
      propertyValue: caseData.propertyInfo?.propertyValue,
      ...additionalData.metadata,
    },
    ...additionalData,
  });
}

  /**
   * Log proposal activity
   */
  static async logProposalActivity(proposal, action, userInfo, additionalData = {}) {
    return this.log({
      entityType: 'Proposal',
      entityId: proposal.proposalId,
      entityName: proposal.clientInfo?.name,
      action,
      performedBy: userInfo,
      description: additionalData.description || `${action} performed on proposal ${proposal.proposalId}`,
      notes: additionalData.notes,
      ipAddress: userInfo.ipAddress,
      userAgent: userInfo.userAgent,
      metadata: {
        proposalId: proposal.proposalId,
        clientName: proposal.clientInfo?.name,
        propertyValue: proposal.clientRequirements?.targetPropertyValue,
        bankCount: proposal.selectedBankProducts?.length,
        ...additionalData.metadata,
      },
      ...additionalData,
    });
  }

  /**
   * Log agent activity
   */
  static async logAgentActivity(agent, action, userInfo, additionalData = {}) {
    return this.log({
      entityType: 'Agent',
      entityId: agent._id.toString(),
      entityName: agent.fullName,
      action,
      performedBy: userInfo,
      description: additionalData.description || `${action} performed on agent ${agent.fullName}`,
      notes: additionalData.notes,
      ipAddress: userInfo.ipAddress,
      userAgent: userInfo.userAgent,
      metadata: {
        agentId: agent._id,
        agentName: agent.fullName,
        agentType: agent.agentType,
        ...additionalData.metadata,
      },
      ...additionalData,
    });
  }

  /**
   * Log partner activity
   */
  static async logPartnerActivity(partner, action, userInfo, additionalData = {}) {
    return this.log({
      entityType: 'Partner',
      entityId: partner._id.toString(),
      entityName: partner.companyName,
      action,
      performedBy: userInfo,
      description: additionalData.description || `${action} performed on partner ${partner.companyName}`,
      notes: additionalData.notes,
      ipAddress: userInfo.ipAddress,
      userAgent: userInfo.userAgent,
      metadata: {
        partnerId: partner._id,
        partnerName: partner.companyName,
        ...additionalData.metadata,
      },
      ...additionalData,
    });
  }

  /**
   * Log commission activity
   */
  static async logCommissionActivity(commission, action, userInfo, additionalData = {}) {
    return this.log({
      entityType: 'Commission',
      entityId: commission.commissionId,
      entityName: commission.recipientName,
      action,
      performedBy: userInfo,
      description: additionalData.description || `${action} on commission ${commission.commissionId}`,
      notes: additionalData.notes,
      ipAddress: userInfo.ipAddress,
      userAgent: userInfo.userAgent,
      metadata: {
        commissionId: commission.commissionId,
        amount: commission.commissionAmount,
        recipient: commission.recipientName,
        caseId: commission.caseId,
        ...additionalData.metadata,
      },
      importance: 'HIGH',
      category: 'PAYMENT_EVENT',
      ...additionalData,
    });
  }

  /**
   * Log document activity
   */
  static async logDocumentActivity(document, action, userInfo, additionalData = {}) {
    return this.log({
      entityType: 'Document',
      entityId: document.documentId,
      entityName: document.fileName,
      action,
      performedBy: userInfo,
      description: additionalData.description || `${action} on document ${document.fileName}`,
      notes: additionalData.notes,
      ipAddress: userInfo.ipAddress,
      userAgent: userInfo.userAgent,
      metadata: {
        documentId: document.documentId,
        fileName: document.fileName,
        documentType: document.documentType,
        entityType: document.entityType,
        ...additionalData.metadata,
      },
      category: 'DOCUMENT_EVENT',
      ...additionalData,
    });
  }

  /**
   * Log security event (login, logout, password change)
   */
  static async logSecurityEvent(user, action, userInfo, additionalData = {}) {
    return this.log({
      entityType: 'User',
      entityId: user._id.toString(),
      entityName: user.email || user.username,
      action,
      performedBy: userInfo,
      description: additionalData.description || `${action} performed by user ${user.email}`,
      notes: additionalData.notes,
      ipAddress: userInfo.ipAddress,
      userAgent: userInfo.userAgent,
      metadata: {
        userId: user._id,
        userEmail: user.email,
        userRole: user.role,
        ...additionalData.metadata,
      },
      importance: 'HIGH',
      category: 'SECURITY_EVENT',
      ...additionalData,
    });
  }
}

module.exports = HistoryService;