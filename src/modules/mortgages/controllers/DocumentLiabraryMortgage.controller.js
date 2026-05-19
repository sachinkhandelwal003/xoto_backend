// controllers/DocumentLibraryMortgage.controller.js

const DocumentRequirement = require("../models/Bankproductdocuments");
const Bank = require("../models/BankModel");

/**
 * =========================================
 * CREATE DOCUMENT REQUIREMENT
 * =========================================
 */
exports.createDocument = async (req, res) => {
  try {
    const { documentKey } = req.body;

    const existingDoc = await DocumentRequirement.findOne({ documentKey });
    if (existingDoc) {
      return res.status(400).json({
        success: false,
        message: "Document with this key already exists"
      });
    }

    const document = await DocumentRequirement.create({
      ...req.body,
      createdBy: req.user?.id || req.user?._id
    });

    return res.status(201).json({
      success: true,
      message: "Document requirement created successfully",
      data: document
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * =========================================
 * GET ALL DOCUMENTS (With Filters)
 * =========================================
 */
exports.getAllDocuments = async (req, res) => {
  try {
    const {
      isGlobal,
      category,
      status,
      documentType,
      employmentType,
      residencyStatus,
      bankId,
      isMandatory,
      search,
      page = 1,
      limit = 20,
      sortBy = "displayOrder",
      sortOrder = "asc"
    } = req.query;

    let query = { isDeleted: false };

    // Global filter
    if (isGlobal !== undefined && isGlobal !== '') {
      query.isGlobal = isGlobal === 'true';
    }
    
    // Category filter
    if (category) query.category = category;
    
    // Status filter
    if (status) query.status = status;
    
    // Document type filter (direct_upload, template_download, sample_view)
    if (documentType) query.documentType = documentType;
    
    // Mandatory filter
    if (isMandatory !== undefined) {
      query.isMandatory = isMandatory === 'true';
    }
    
    // Employment type filter
    if (employmentType) {
      query.applicableEmploymentTypes = { $in: [employmentType, "Both"] };
    }
    
    // Residency status filter
    if (residencyStatus) {
      query.applicableResidencyStatuses = { $in: [residencyStatus, "All"] };
    }
    
    // Bank specific filter (global OR specific bank)
    if (bankId) {
      query.$or = [
        { isGlobal: true },
        { applicableBanks: bankId }
      ];
    }

    // Search filter
    if (search) {
      query.$or = [
        { documentName: { $regex: search, $options: 'i' } },
        { documentKey: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [documents, total] = await Promise.all([
      DocumentRequirement.find(query)
        .populate("applicableBanks", "bankName bankCode logo")
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit)),
      DocumentRequirement.countDocuments(query)
    ]);

    // Add computed fields for frontend
    const enrichedDocuments = documents.map(doc => ({
      ...doc.toObject(),
      hasTemplate: doc.hasTemplate,
      hasSampleDocument: doc.hasSampleDocument,
      isDirectUpload: doc.isDirectUpload,
      isTemplateDownload: doc.isTemplateDownload,
      isSampleView: doc.isSampleView,
      actionType: doc.documentType === "direct_upload" ? "upload" : 
                 doc.documentType === "template_download" ? "download_and_upload" : "view_only"
    }));

    return res.status(200).json({
      success: true,
      data: enrichedDocuments,
      total: total,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total
      },
      filters: {
        documentType: documentType || null,
        category: category || null,
        status: status || null,
        isGlobal: isGlobal || null,
        employmentType: employmentType || null,
        residencyStatus: residencyStatus || null
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * =========================================
 * GET GLOBAL DOCUMENTS (No Bank Specific)
 * =========================================
 */
exports.getGlobalDocuments = async (req, res) => {
  try {
    const { 
      documentType, 
      employmentType, 
      residencyStatus, 
      isMandatory,
      category 
    } = req.query;
    
    let query = {
      isGlobal: true,
      isDeleted: false,
      status: "Active"
    };
    
    if (documentType) query.documentType = documentType;
    if (category) query.category = category;
    if (isMandatory !== undefined) query.isMandatory = isMandatory === 'true';
    
    // Employment type filter
    if (employmentType) {
      query.applicableEmploymentTypes = { $in: [employmentType, "Both"] };
    }
    
    // Residency status filter
    if (residencyStatus) {
      query.applicableResidencyStatuses = { $in: [residencyStatus, "All"] };
    }
    
    const documents = await DocumentRequirement.find(query)
      .sort({ displayOrder: 1 });

    // Group by document type
    const grouped = {
      direct_upload: documents.filter(d => d.documentType === "direct_upload"),
      template_download: documents.filter(d => d.documentType === "template_download"),
      sample_view: documents.filter(d => d.documentType === "sample_view")
    };

    // Group by category
    const byCategory = {
      Identity: documents.filter(d => d.category === "Identity"),
      Income: documents.filter(d => d.category === "Income"),
      Banking: documents.filter(d => d.category === "Banking"),
      Property: documents.filter(d => d.category === "Property"),
      Business: documents.filter(d => d.category === "Business"),
      Insurance: documents.filter(d => d.category === "Insurance"),
      Other: documents.filter(d => d.category === "Other")
    };

    return res.status(200).json({
      success: true,
      count: documents.length,
      data: documents,
      grouped: grouped,
      byCategory: byCategory,
      summary: {
        total: documents.length,
        directUpload: grouped.direct_upload.length,
        templateDownload: grouped.template_download.length,
        sampleView: grouped.sample_view.length,
        mandatory: documents.filter(d => d.isMandatory).length,
        optional: documents.filter(d => !d.isMandatory).length
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * =========================================
 * GET DOCUMENTS BY BANK ID (With All Filters)
 * =========================================
 */
exports.getDocumentsByBankId = async (req, res) => {
  try {
    const { bankId } = req.params;
    const {
      employmentType,
      residencyStatus,
      mortgageType,
      isMandatory,
      documentType,
      category,
      isGlobal,
      search
    } = req.query;

    const bank = await Bank.findById(bankId);
    if (!bank || bank.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Bank not found"
      });
    }

    let query = {
      status: "Active",
      isDeleted: false,
      $or: [
        { isGlobal: true },
        { applicableBanks: bankId }
      ]
    };

    // Global/Bank specific filter
    if (isGlobal !== undefined && isGlobal !== '') {
      query.isGlobal = isGlobal === 'true';
    }

    // Employment type filter
    if (employmentType) {
      query.applicableEmploymentTypes = { $in: [employmentType, "Both"] };
    }
    
    // Residency status filter
    if (residencyStatus) {
      query.applicableResidencyStatuses = { $in: [residencyStatus, "All"] };
    }
    
    // Mortgage type filter
    if (mortgageType) {
      query.applicableMortgageTypes = { $in: [mortgageType, "Both"] };
    }
    
    // Mandatory filter
    if (isMandatory !== undefined) {
      query.isMandatory = isMandatory === 'true';
    }
    
    // Document type filter
    if (documentType) {
      query.documentType = documentType;
    }
    
    // Category filter
    if (category) {
      query.category = category;
    }
    
    // Search filter
    if (search) {
      query.$or = [
        { documentName: { $regex: search, $options: 'i' } },
        { documentKey: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const documents = await DocumentRequirement.find(query)
      .sort({ displayOrder: 1 });

    // Separate by document type
    const globalDocs = documents.filter(doc => doc.isGlobal === true);
    const bankSpecificDocs = documents.filter(doc => 
      doc.isGlobal === false && doc.applicableBanks?.includes(bankId)
    );

    // Group by document type
    const directUpload = documents.filter(d => d.documentType === "direct_upload");
    const templateDownload = documents.filter(d => d.documentType === "template_download");
    const sampleView = documents.filter(d => d.documentType === "sample_view");

    // Group by category
    const byCategory = {
      Identity: documents.filter(d => d.category === "Identity"),
      Income: documents.filter(d => d.category === "Income"),
      Banking: documents.filter(d => d.category === "Banking"),
      Property: documents.filter(d => d.category === "Property"),
      Business: documents.filter(d => d.category === "Business"),
      Insurance: documents.filter(d => d.category === "Insurance"),
      BankForm: documents.filter(d => d.category === "Bank Form"),
      Other: documents.filter(d => d.category === "Other")
    };

    // Enrich documents with action information
    const enrichedDocuments = documents.map(doc => ({
      ...doc.toObject(),
      hasTemplate: doc.hasTemplate,
      hasSampleDocument: doc.hasSampleDocument,
      isDirectUpload: doc.isDirectUpload,
      isTemplateDownload: doc.isTemplateDownload,
      isSampleView: doc.isSampleView,
      actionType: doc.documentType === "direct_upload" ? "upload" : 
                 doc.documentType === "template_download" ? "download_and_upload" : "view_only",
      // For frontend to know who should handle this
      defaultHandler: doc.documentType === "direct_upload" ? "Advisor" : "Ops"
    }));

    return res.status(200).json({
      success: true,
      bank: {
        _id: bank._id,
        bankName: bank.bankName,
        bankCode: bank.bankCode,
        logo: bank.logo
      },
      data: {
        all: enrichedDocuments,
        global: globalDocs.map(d => ({
          ...d.toObject(),
          defaultHandler: "Advisor",
          documentSource: "Global"
        })),
        bankSpecific: bankSpecificDocs.map(d => ({
          ...d.toObject(),
          defaultHandler: "Ops",
          documentSource: "Bank"
        })),
        byType: {
          direct_upload: directUpload,
          template_download: templateDownload,
          sample_view: sampleView
        },
        byCategory: byCategory
      },
      filters: {
        employmentType: employmentType || null,
        residencyStatus: residencyStatus || null,
        mortgageType: mortgageType || null,
        isMandatory: isMandatory || null,
        documentType: documentType || null,
        category: category || null,
        isGlobal: isGlobal || null
      },
      summary: {
        total: documents.length,
        global: globalDocs.length,
        bankSpecific: bankSpecificDocs.length,
        mandatory: documents.filter(d => d.isMandatory).length,
        optional: documents.filter(d => !d.isMandatory).length,
        directUpload: directUpload.length,
        templateDownload: templateDownload.length,
        sampleView: sampleView.length
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * =========================================
 * GET REQUIRED DOCUMENTS (Dynamic for Case Creation)
 * =========================================
 */
exports.getRequiredDocuments = async (req, res) => {
  try {
    const {
      bankId,
      employmentType,
      residencyStatus,
      mortgageType,
      isMandatory
    } = req.query;

    if (!bankId) {
      return res.status(400).json({
        success: false,
        message: "bankId is required"
      });
    }

    const documents = await DocumentRequirement.getRequiredDocuments({
      bankId,
      employmentType: employmentType || "Both",
      residencyStatus: residencyStatus || "All",
      mortgageType: mortgageType || "Both"
    });

    // Filter by mandatory if specified
    let filteredDocs = documents;
    if (isMandatory !== undefined) {
      filteredDocs = documents.filter(d => d.isMandatory === (isMandatory === 'true'));
    }

    // Separate global (customer docs) and bank specific (forms)
    const globalDocs = filteredDocs.filter(doc => doc.isGlobal === true);
    const bankSpecificDocs = filteredDocs.filter(doc => 
      doc.isGlobal === false && doc.applicableBanks?.includes(bankId)
    );

    // Enrich documents with action information
    const enrichedDocuments = filteredDocs.map(doc => ({
      ...doc.toObject(),
      hasTemplate: doc.hasTemplate,
      hasSampleDocument: doc.hasSampleDocument,
      actionType: doc.documentType === "direct_upload" ? "upload" : 
                 doc.documentType === "template_download" ? "download_and_upload" : "view_only",
      templateUrl: doc.template?.fileUrl,
      sampleUrl: doc.sampleDocument?.fileUrl,
      // For Case creation - who should handle this document
      assignedTo: doc.documentType === "direct_upload" ? "advisor" : "ops",
      canSkip: doc.documentType === "template_download"  // Bank forms can be skipped
    }));

    // Group by document type
    const grouped = {
      direct_upload: enrichedDocuments.filter(d => d.documentType === "direct_upload"),
      template_download: enrichedDocuments.filter(d => d.documentType === "template_download"),
      sample_view: enrichedDocuments.filter(d => d.documentType === "sample_view")
    };

    return res.status(200).json({
      success: true,
      bankId: bankId,
      data: {
        all: enrichedDocuments,
        global: globalDocs,
        bankSpecific: bankSpecificDocs,
        byType: grouped
      },
      summary: {
        total: filteredDocs.length,
        global: globalDocs.length,
        bankSpecific: bankSpecificDocs.length,
        mandatory: filteredDocs.filter(d => d.isMandatory).length,
        optional: filteredDocs.filter(d => !d.isMandatory).length,
        directUpload: grouped.direct_upload.length,
        templateDownload: grouped.template_download.length,
        sampleView: grouped.sample_view.length,
        // Count of documents that can be skipped (bank forms)
        canSkip: grouped.template_download.length
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * =========================================
 * GET SINGLE DOCUMENT
 * =========================================
 */
exports.getDocumentById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const document = await DocumentRequirement.findById(id)
      .populate("applicableBanks", "bankName bankCode logo");

    if (!document || document.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Document not found"
      });
    }

    // Add action info for frontend
    const enrichedDocument = {
      ...document.toObject(),
      hasTemplate: document.hasTemplate,
      hasSampleDocument: document.hasSampleDocument,
      isDirectUpload: document.isDirectUpload,
      isTemplateDownload: document.isTemplateDownload,
      isSampleView: document.isSampleView,
      actionConfig: {
        type: document.documentType,
        canDownload: document.documentType === "template_download" && !!document.template?.fileUrl,
        canView: document.documentType === "sample_view" && !!document.sampleDocument?.fileUrl,
        canUpload: document.documentType !== "sample_view",
        requiresSignature: document.requiresSignature,
        requiresStamp: document.requiresStamp
      }
    };

    return res.status(200).json({
      success: true,
      data: enrichedDocument
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * =========================================
 * GET DOCUMENT BY KEY
 * =========================================
 */
exports.getDocumentByKey = async (req, res) => {
  try {
    const { key } = req.params;
    
    const document = await DocumentRequirement.findOne({
      documentKey: key.toLowerCase(),
      isDeleted: false
    }).populate("applicableBanks", "bankName bankCode");

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: document
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * =========================================
 * UPDATE DOCUMENT
 * =========================================
 */
exports.updateDocument = async (req, res) => {
  try {
    const { id } = req.params;
    
    const document = await DocumentRequirement.findById(id);
    if (!document || document.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Document not found"
      });
    }

    if (req.body.documentKey && req.body.documentKey !== document.documentKey) {
      const existingDoc = await DocumentRequirement.findOne({
        documentKey: req.body.documentKey,
        isDeleted: false
      });
      if (existingDoc) {
        return res.status(400).json({
          success: false,
          message: "Document with this key already exists"
        });
      }
    }

    const updatedDocument = await DocumentRequirement.findByIdAndUpdate(
      id,
      {
        ...req.body,
        updatedBy: req.user?.id || req.user?._id
      },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: "Document updated successfully",
      data: updatedDocument
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * =========================================
 * DELETE DOCUMENT
 * =========================================
 */
exports.deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    
    const document = await DocumentRequirement.findById(id);
    if (!document || document.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Document not found"
      });
    }

    await document.softDelete();

    return res.status(200).json({
      success: true,
      message: "Document deleted successfully"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * =========================================
 * RESTORE DOCUMENT
 * =========================================
 */
exports.restoreDocument = async (req, res) => {
  try {
    const { id } = req.params;
    
    const document = await DocumentRequirement.findById(id);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found"
      });
    }

    await document.restore();

    return res.status(200).json({
      success: true,
      message: "Document restored successfully",
      data: document
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * =========================================
 * UPDATE DOCUMENT STATUS
 * =========================================
 */
exports.updateDocumentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    const validStatuses = ["Active", "Inactive", "Archived"];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`
      });
    }

    const document = await DocumentRequirement.findById(id);
    if (!document || document.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Document not found"
      });
    }

    const previousStatus = document.status;
    document.status = status;
    document.updatedBy = req.user?.id || req.user?._id;
    
    if (status === "Archived") {
      document.isDeleted = true;
      document.deletedAt = new Date();
    } else if (status === "Active" && previousStatus === "Archived") {
      document.isDeleted = false;
      document.deletedAt = null;
    }

    await document.save();

    return res.status(200).json({
      success: true,
      message: `Document status updated to ${status} successfully`,
      data: {
        _id: document._id,
        documentName: document.documentName,
        documentKey: document.documentKey,
        previousStatus: previousStatus,
        currentStatus: document.status,
        reason: reason || null,
        updatedAt: document.updatedAt
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * =========================================
 * DOWNLOAD TEMPLATE
 * =========================================
 */
exports.downloadTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    
    const document = await DocumentRequirement.findById(id);
    if (!document || !document.hasTemplate) {
      return res.status(404).json({
        success: false,
        message: "Template not found"
      });
    }
    
    // Return template URL or redirect
    return res.status(200).json({
      success: true,
      downloadUrl: document.template.fileUrl,
      fileName: document.template.fileName,
      message: "Template ready for download"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * =========================================
 * VIEW SAMPLE DOCUMENT
 * =========================================
 */
exports.viewSampleDocument = async (req, res) => {
  try {
    const { id } = req.params;
    
    const document = await DocumentRequirement.findById(id);
    if (!document || !document.hasSampleDocument) {
      return res.status(404).json({
        success: false,
        message: "Sample document not found"
      });
    }
    
    return res.status(200).json({
      success: true,
      viewUrl: document.sampleDocument.fileUrl,
      fileName: document.sampleDocument.fileName,
      description: document.sampleDocument.description
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};