// utils/caseDocumentHelper.js
import BankDocumentRequirement from '../../mortgages/models/Bankproductdocuments.js';
import CaseDocumentRequirement from '../models/CaseDocumentRequirement.js';

/**
 * Initialize document requirements for a case
 * Filters documents based on customer's employment and residency status
 */
export const initializeCaseDocuments = async ({
  caseId,
  bankId,
  employmentStatus,
  residencyStatus,
  mortgageType = 'Both',
  creatorRole = 'advisor',   // 'advisor' | 'partner' | 'partner_affiliated_agent' | 'admin'
  skipBankForm = true        // advisor-only: if true, bank template forms stay with Ops
}) => {
  try {
    // Fetch required documents with filters
    const requiredDocuments = await BankDocumentRequirement.getRequiredDocuments({
      bankId: bankId,
      employmentType: employmentStatus || 'Both',
      residencyStatus: residencyStatus || 'All',
      mortgageType: mortgageType
    });

    if (!requiredDocuments || requiredDocuments.length === 0) {
      return {
        success: true,
        message: 'No documents required for this case',
        documents: [],
        summary: {
          total: 0,
          global: 0,
          bank: 0,
          advisorHandled: 0,
          opsHandled: 0,
          mandatory: 0,
          optional: 0,
          directUpload: 0,
          templateDownload: 0,
          sampleView: 0
        }
      };
    }

    // Separate documents by source
    const globalDocuments = requiredDocuments.filter(doc => doc.isGlobal === true);
    // ObjectId equality requires .toString() — Array.includes() uses reference equality
    const bankIdStr = bankId ? bankId.toString() : null;
    const bankSpecificDocuments = requiredDocuments.filter(doc =>
      doc.isGlobal === false &&
      bankIdStr &&
      doc.applicableBanks?.some(id => id.toString() === bankIdStr)
    );

    let advisorHandledCount = 0;
    let opsHandledCount = 0;
    let otherHandledCount = 0;
    const createdDocuments = [];

const isOtherRole =
 ['partner', 'partner_affiliated_agent']
 .includes(creatorRole);
    // Create GLOBAL documents (Always handled by Advisor or Partner)
    for (const doc of globalDocuments) {
      const created = await CaseDocumentRequirement.create({
        caseId: caseId,
        documentRequirementId: doc._id,
        documentKey: doc.documentKey,
        documentName: doc.documentName,
        description: doc.description || '',
        category: doc.category,
        actionType: doc.documentType,
        isMandatory: doc.isMandatory,
        source: 'Global',
        templateUrl: doc.template?.fileUrl || null,
        templateFileName: doc.template?.fileName || null,
        sampleUrl: doc.sampleDocument?.fileUrl || null,
        handledBy: isOtherRole ? 'Other' : 'Advisor',
        isUploaded: false,
        isVerified: false,
        toggleState: {
          handledByAdvisor: !isOtherRole,
          assignedToOps: false,
          toggledAt: null
        },
        // Validation rules
        requiresFrontBack: doc.requiresFrontBack || false,
        requiresSignature: doc.requiresSignature || false,
        requiresStamp: doc.requiresStamp || false,
        requiresAttestation: doc.requiresAttestation || false,
        requiresTranslation: doc.requiresTranslation || false,
        maxFileSizeMB: doc.maxFileSizeMB || 10,
        allowedFileTypes: doc.allowedFileTypes || ['pdf', 'jpg', 'jpeg', 'png'],
        placeholderText: doc.placeholderText || '',
        helperText: doc.helperText || '',
        instructions: doc.instructions || '',
        displayOrder: doc.displayOrder || 0
      });
      createdDocuments.push(created);
    if (isOtherRole) {
 otherHandledCount++;
} else {
 advisorHandledCount++;
}
    }

    // Create BANK SPECIFIC documents
    for (const doc of bankSpecificDocuments) {
      let handledBy, handledByAdvisor, assignedToOps;

      if (isOtherRole) {
        handledBy = 'Other';

 handledByAdvisor = false;

 assignedToOps = false;

 otherHandledCount++;
      } else if (creatorRole === 'admin') {
        handledBy = 'Advisor';
        handledByAdvisor = true;
        assignedToOps = false;
        advisorHandledCount++;
      } else if (doc.documentType === 'template_download' && skipBankForm) {
        // Advisor skipping bank form → delegate template forms to Ops
        handledBy = 'Ops';
        handledByAdvisor = false;
        assignedToOps = true;
        opsHandledCount++;
      } else {
        // Advisor handling all themselves (no skip), or direct_upload / sample_view types
        handledBy = 'Advisor';
        handledByAdvisor = true;
        assignedToOps = false;
        advisorHandledCount++;
      }

      const created = await CaseDocumentRequirement.create({
        caseId: caseId,
        documentRequirementId: doc._id,
        documentKey: doc.documentKey,
        documentName: doc.documentName,
        description: doc.description || '',
        category: doc.category,
        actionType: doc.documentType,
        isMandatory: doc.isMandatory,
        source: 'Bank',
        templateUrl: doc.template?.fileUrl || null,
        templateFileName: doc.template?.fileName || null,
        sampleUrl: doc.sampleDocument?.fileUrl || null,
        handledBy: handledBy,
        isUploaded: false,
        isVerified: false,
        toggleState: {
          handledByAdvisor: handledByAdvisor,
          assignedToOps: assignedToOps,
          toggledAt: null
        },
        // Validation rules
        requiresFrontBack: doc.requiresFrontBack || false,
        requiresSignature: doc.requiresSignature || false,
        requiresStamp: doc.requiresStamp || false,
        requiresAttestation: doc.requiresAttestation || false,
        requiresTranslation: doc.requiresTranslation || false,
        maxFileSizeMB: doc.maxFileSizeMB || 10,
        allowedFileTypes: doc.allowedFileTypes || ['pdf', 'jpg', 'jpeg', 'png'],
        placeholderText: doc.placeholderText || '',
        helperText: doc.helperText || '',
        instructions: doc.instructions || '',
        displayOrder: doc.displayOrder || 0
      });
      createdDocuments.push(created);
    }

    return {
      success: true,
      message: `Initialized ${createdDocuments.length} document requirements`,
      documents: createdDocuments,
      summary: {
        total: createdDocuments.length,
        global: globalDocuments.length,
        bank: bankSpecificDocuments.length,
        advisorHandled: advisorHandledCount,
        opsHandled: opsHandledCount,
        otherHandled: otherHandledCount,
        mandatory: createdDocuments.filter(d => d.isMandatory).length,
        optional: createdDocuments.filter(d => !d.isMandatory).length,
        directUpload: createdDocuments.filter(d => d.actionType === 'direct_upload').length,
        templateDownload: createdDocuments.filter(d => d.actionType === 'template_download').length,
        sampleView: createdDocuments.filter(d => d.actionType === 'sample_view').length
      }
    };

  } catch (error) {
    console.error('Error initializing case documents:', error);
    return {
      success: false,
      message: error.message,
      documents: [],
      summary: {
        total: 0,
        global: 0,
        bank: 0,
        advisorHandled: 0,
        opsHandled: 0,
        otherHandled: 0,
        mandatory: 0,
        optional: 0,
        directUpload: 0,
        templateDownload: 0,
        sampleView: 0
      }
    };
  }
};

/**
 * Get document requirements for a case with filters
 */
export const getCaseDocumentsByFilter = async (caseId, filters = {}) => {
  try {
    const query = { caseId: caseId, isDeleted: false };
    
    if (filters.source) query.source = filters.source;
    if (filters.handledBy) query.handledBy = filters.handledBy;
    if (filters.actionType) query.actionType = filters.actionType;
    if (filters.isUploaded !== undefined) query.isUploaded = filters.isUploaded;
    if (filters.isMandatory !== undefined) query.isMandatory = filters.isMandatory;
    
    const documents = await CaseDocumentRequirement.find(query)
      .sort({ source: -1, handledBy: 1, displayOrder: 1, documentKey: 1 });
    
    return {
      success: true,
      documents: documents,
      summary: {
        total: documents.length,
        uploaded: documents.filter(d => d.isUploaded).length,
        pending: documents.filter(d => !d.isUploaded).length,
        verified: documents.filter(d => d.isVerified).length,
        global: documents.filter(d => d.source === 'Global').length,
        bank: documents.filter(d => d.source === 'Bank').length,
        advisorHandled: documents.filter(d => d.handledBy === 'Advisor').length,
        opsHandled: documents.filter(d => d.handledBy === 'Ops').length,
        partnerHandled: documents.filter(d => d.handledBy === 'Partner').length,
        otherHandled: documents.filter(d => d.handledBy === 'Other').length
      }
    };
    
  } catch (error) {
    console.error('Error getting case documents:', error);
    return {
      success: false,
      message: error.message,
      documents: []
    };
  }
};

/**
 * Toggle document handler (Advisor can take bank forms)
 */
export const toggleDocumentHandlerForCase = async (caseId, documentKey, handledByAdvisor) => {
  try {
    const docRequirement = await CaseDocumentRequirement.findOne({
      caseId: caseId,
      documentKey: documentKey,
      source: 'Bank',
      isDeleted: false
    });
    
    if (!docRequirement) {
      throw new Error('Document not found or cannot be toggled');
    }
    
    if (docRequirement.isUploaded) {
      throw new Error('Cannot change handler after document is uploaded');
    }
    
    docRequirement.handledBy = handledByAdvisor ? 'Advisor' : 'Ops';
    docRequirement.toggleState = {
      handledByAdvisor: handledByAdvisor,
      assignedToOps: !handledByAdvisor,
      toggledAt: new Date()
    };
    
    await docRequirement.save();
    
    return {
      success: true,
      message: handledByAdvisor 
        ? 'You will handle this form. Please upload before submission.'
        : 'Ops team will handle this form. You can skip.',
      document: docRequirement
    };
    
  } catch (error) {
    return {
      success: false,
      message: error.message,
      document: null
    };
  }
};