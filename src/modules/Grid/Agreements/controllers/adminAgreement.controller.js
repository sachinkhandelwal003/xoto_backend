const mongoose = require('mongoose');
const AdminAgreement = require('../models/AdminAgreement.model');
const Developer = require('../../Developer/models/developer.model');
const Agency = require('../../agency/models/index');
const Agent = require('../../Agent/models/agent');
const PartnerAgreement = require('../../dealrecord/models/Partneragreement.model');
const asyncHandler = require('../../../../utils/asyncHandler');
const { APIError } = require('../../../../utils/errorHandler');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const GridNotification = require('../../Notification/GridNotificationmodal').default;

const MODEL_BY_TARGET = {
  developer: Developer,
  agency: Agency,
  agent: Agent,
};

const TARGET_ID_FIELD = {
  developer: 'developerId',
  agency: 'agencyId',
  agent: 'agentId',
};

const EMBEDDED_DOC_TYPE = {
  commercial_agreement: 'main_agreement',
  agency_master_agreement: 'main_agreement',
  agent_a2a_agreement: 'main_agreement',
};

const parseJson = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (Array.isArray(value) || typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const paginate = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
};

const paginationMeta = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
  hasNextPage: page < Math.ceil(total / limit),
  hasPrevPage: page > 1,
});

const normalizeTargetType = (targetType) => {
  const type = String(targetType || '').toLowerCase().trim();
  if (!MODEL_BY_TARGET[type]) {
    throw new APIError('targetType must be developer, agency, or agent', StatusCodes.BAD_REQUEST);
  }
  return type;
};

const ensureObjectId = (id, label) => {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new APIError(`${label} is required and must be a valid ObjectId`, StatusCodes.BAD_REQUEST);
  }
  return id;
};

const getTarget = async (targetType, targetId) => {
  const Model = MODEL_BY_TARGET[targetType];
  const target = await Model.findById(targetId).select('-password');
  if (!target) {
    throw new APIError(`${targetType} not found`, StatusCodes.NOT_FOUND);
  }
  return target;
};

const targetDisplay = (targetType, target) => {
  if (targetType === 'developer') {
    return {
      name: target.companyName || target.name || '',
      email: target.email || target.officialEmailId || '',
      phone: target.phone_number || '',
    };
  }

  if (targetType === 'agency') {
    return {
      name: target.companyName || target.primaryContactName || '',
      email: target.primaryContactEmail || '',
      phone: target.primaryContactPhone || '',
    };
  }

  return {
    name: target.fullName || [target.first_name, target.last_name].filter(Boolean).join(' '),
    email: target.email || '',
    phone: target.phone_number || '',
  };
};

const buildParties = (targetType, target, extraParties = []) => {
  const targetInfo = targetDisplay(targetType, target);
  return [
    { partyType: 'xoto', name: 'Xoto' },
    {
      partyType: targetType,
      partyId: target._id,
      name: targetInfo.name,
      email: targetInfo.email,
      phone: targetInfo.phone,
    },
    ...extraParties,
  ];
};

const fileToDocument = (file, req, defaults = {}) => ({
  name: defaults.name || file.originalname,
  originalName: file.originalname,
  url: `uploads/agreements/${file.filename}`,
  path: file.path,
  mimeType: file.mimetype,
  size: file.size,
  remarks: defaults.remarks || '',
  uploadedBy: req.user?._id || null,
  uploadedAt: new Date(),
});

const normalizeDocumentInput = (input, req) => {
  if (!input) return [];

  if (typeof input === 'string') {
    const parsed = parseJson(input, null);
    if (parsed) return normalizeDocumentInput(parsed, req);

    return input
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean)
      .map((url) => ({
        name: req.body.name || req.body.title || 'Agreement document',
        url,
        remarks: req.body.remarks || '',
      }));
  }

  if (Array.isArray(input)) {
    return input.flatMap((item) => normalizeDocumentInput(item, req));
  }

  if (typeof input === 'object' && input.url) {
    return [input];
  }

  return [];
};

const bodyDocuments = (req) => {
  const docs = [
    ...normalizeDocumentInput(req.body.documents, req),
    ...normalizeDocumentInput(req.body.documentUrls, req),
    ...normalizeDocumentInput(req.body.agreementDocuments, req),
    ...normalizeDocumentInput(req.body.url, req),
    ...normalizeDocumentInput(req.body.documentUrl, req),
  ];

  const uniqueDocs = [];
  const seen = new Set();

  docs.forEach((doc) => {
    const url = typeof doc === 'string' ? doc : doc.url;
    if (!url || seen.has(url)) return;
    seen.add(url);
    uniqueDocs.push({
      name: doc.name || doc.originalName || req.body.name || req.body.title || 'Agreement document',
      originalName: doc.originalName || doc.name || '',
      url,
      path: doc.path || '',
      mimeType: doc.mimeType || '',
      size: Number(doc.size) || 0,
      remarks: doc.remarks || req.body.remarks || '',
      uploadedBy: req.user?._id || null,
      uploadedAt: doc.uploadedAt ? new Date(doc.uploadedAt) : new Date(),
    });
  });

  return uniqueDocs;
};

const collectDocuments = (req) => {
  const files = Array.isArray(req.files) ? req.files : (req.file ? [req.file] : []);
  const uploaded = files.map((file) => fileToDocument(file, req, {
    name: req.body.name,
    remarks: req.body.remarks,
  }));
  return [...uploaded, ...bodyDocuments(req)];
};

const syncEmbeddedAgreement = async (targetType, target, agreement, documents) => {
  const now = new Date();
  const embeddedDocs = documents.map((doc) => ({
    type: EMBEDDED_DOC_TYPE[agreement.agreementType] || agreement.agreementType || 'main_agreement',
    name: doc.name || doc.originalName || agreement.title,
    url: doc.url,
    uploadedAt: doc.uploadedAt || now,
    uploadedBy: 'admin',
  }));

  if (targetType === 'developer') {
    target.agreementDocuments = [
      ...(target.agreementDocuments || []),
      ...embeddedDocs.map((doc) => ({
        type: ['main_agreement', 'commission_schedule', 'addendum', 'other'].includes(doc.type)
          ? doc.type
          : 'main_agreement',
        name: doc.name,
        url: doc.url,
        uploadedAt: doc.uploadedAt,
        uploadedBy: 'admin',
      })),
    ];
    target.agreementSigned = true;
    target.agreementSignedAt = now;
    target.agreementStatus = target.agreementStatus === 'verified' ? 'verified' : 'pending_review';
    target.onboardingStatus = target.onboardingStatus === 'completed'
      ? 'completed'
      : 'agreement_pending';
    target.accountStatus = target.accountStatus === 'active' ? 'active' : 'pending';
    await target.save();
    return;
  }

  if (targetType === 'agency') {
    target.agreementDocuments = [
      ...(target.agreementDocuments || []),
      ...embeddedDocs.map((doc) => ({
        type: doc.type || 'main_agreement',
        name: doc.name,
        url: doc.url,
        uploadedAt: doc.uploadedAt,
      })),
    ];
    target.agreementStatus = target.agreementStatus === 'approved' ? 'approved' : 'pending';
    target.agreementSigned = true;
    target.agreementUnderReview = true;
    await target.save();
  }
};

const syncPartnerAgreement = async (targetType, target, agreement, documents, req) => {
  if (!['agency', 'agent'].includes(targetType)) return null;

  const filter = targetType === 'agency'
    ? { partyType: 'agency', agencyId: target._id, status: 'active' }
    : { partyType: 'agent', agentId: target._id, status: 'active' };

  let partnerAgreement = await PartnerAgreement.findOne(filter).sort({ createdAt: -1 });
  if (!partnerAgreement) {
    partnerAgreement = new PartnerAgreement({
      partyType: targetType,
      agencyId: targetType === 'agency' ? target._id : target.agency || null,
      agentId: targetType === 'agent' ? target._id : null,
      commissionSplitPercent: Number(req.body.commissionSplitPercent) || 0,
      referralSplitPercent: Number(req.body.referralSplitPercent) || 0,
      platformAccessTerms: req.body.platformAccessTerms || 'Agreement uploaded by admin.',
      notes: req.body.notes || '',
      effectiveDate: agreement.effectiveDate || new Date(),
      expiryDate: agreement.expiryDate || null,
      createdBy: req.user._id,
    });
  }

  documents.forEach((doc) => {
    partnerAgreement.agreementDocuments.push({
      name: doc.name,
      remarks: doc.remarks || '',
      url: doc.url,
      mimeType: doc.mimeType || '',
      size: doc.size || 0,
      uploadedBy: null,
      uploadedAt: doc.uploadedAt || new Date(),
    });
  });

  if (!partnerAgreement.signedDocumentUrl && documents[0]?.url) {
    partnerAgreement.signedDocumentUrl = documents[0].url;
  }
  if (req.body.expiryDate) partnerAgreement.expiryDate = new Date(req.body.expiryDate);

  await partnerAgreement.save();
  return partnerAgreement;
};

const syncVerificationStatus = async (targetType, target, status, userId) => {
  const now = new Date();

  if (targetType === 'developer') {
    if (status === 'verified') {
      target.agreementStatus = 'verified';
      target.agreementVerified = true;
      target.agreementVerifiedAt = now;
      target.agreementVerifiedBy = userId;
      target.agreementLastReviewedAt = now;
      target.agreementLastReviewedBy = userId;
      target.agreementSigned = true;
      target.onboardingStatus = 'completed';
      target.onboardingCompletedAt = target.onboardingCompletedAt || now;
      target.accountStatus = 'active';
      target.isVerifiedByAdmin = true;
    } else if (status === 'changes_requested') {
      target.agreementStatus = 'changes_requested';
      target.agreementVerified = false;
      target.agreementLastReviewedAt = now;
      target.agreementLastReviewedBy = userId;
      target.onboardingStatus = 'agreement_pending';
      target.accountStatus = 'pending';
    }
    await target.save();
    return;
  }

  if (targetType === 'agency') {
    if (status === 'verified') {
      target.agreementStatus = 'approved';
      target.agreementVerified = true;
      target.agreementSigned = true;
      target.agreementUnderReview = false;
      target.onboardingStatus = 'completed';
      target.isActive = true;
      target.isSuspended = false;
    } else if (status === 'changes_requested') {
      target.agreementStatus = 'changes_requested';
      target.agreementVerified = false;
      target.agreementUnderReview = true;
    }
    await target.save();
    return;
  }

  if (targetType === 'agent') {
    if (status === 'verified') {
      target.adminApprovalStatus = 'approved';
      target.adminApprovedAt = target.adminApprovedAt || now;
      target.onboarding_status = 'approved';
      target.isActive = true;
    } else if (status === 'changes_requested') {
      target.adminApprovalStatus = 'pending';
      target.onboarding_status = 'pending';
    }
    await target.save();
  }
};

const buildListFilter = (query) => {
  const filter = {};
  if (query.targetType) filter.targetType = normalizeTargetType(query.targetType);
  if (query.status) filter.status = query.status;
  if (query.agreementType) filter.agreementType = query.agreementType;
  if (query.developerId) filter.developerId = ensureObjectId(query.developerId, 'developerId');
  if (query.agencyId) filter.agencyId = ensureObjectId(query.agencyId, 'agencyId');
  if (query.agentId) filter.agentId = ensureObjectId(query.agentId, 'agentId');
  if (query.fromDate || query.toDate) {
    filter.createdAt = {};
    if (query.fromDate) filter.createdAt.$gte = new Date(query.fromDate);
    if (query.toDate) filter.createdAt.$lte = new Date(query.toDate);
  }
  return filter;
};

exports.getUploadOptions = asyncHandler(async (req, res) => {
  const targetType = req.query.targetType ? normalizeTargetType(req.query.targetType) : null;
  const search = String(req.query.search || '').trim();
  const includeAll = req.query.includeAll === 'true';
  const { page, limit, skip } = paginate(req.query);

  const types = targetType ? [targetType] : ['developer', 'agency', 'agent'];
  const data = {};

  await Promise.all(types.map(async (type) => {
    const Model = MODEL_BY_TARGET[type];
    const filter = {};

    if (!includeAll) {
      if (type === 'developer') {
        filter.accountStatus = { $ne: 'rejected' };
        filter.onboardingStatus = { $ne: 'completed' };
      } else if (type === 'agency') {
        filter.agreementStatus = { $ne: 'approved' };
      } else if (type === 'agent') {
        filter.adminApprovalStatus = { $ne: 'declined' };
      }
    }

    if (search) {
      if (type === 'developer') {
        filter.$or = [
          { companyName: { $regex: search, $options: 'i' } },
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone_number: { $regex: search, $options: 'i' } },
        ];
      } else if (type === 'agency') {
        filter.$or = [
          { companyName: { $regex: search, $options: 'i' } },
          { primaryContactName: { $regex: search, $options: 'i' } },
          { primaryContactEmail: { $regex: search, $options: 'i' } },
          { primaryContactPhone: { $regex: search, $options: 'i' } },
        ];
      } else {
        filter.$or = [
          { fullName: { $regex: search, $options: 'i' } },
          { first_name: { $regex: search, $options: 'i' } },
          { last_name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone_number: { $regex: search, $options: 'i' } },
        ];
      }
    }

    const [items, total] = await Promise.all([
      Model.find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(targetType ? skip : 0)
        .limit(targetType ? limit : 50)
        .lean(),
      Model.countDocuments(filter),
    ]);

    data[type] = {
      data: items.map((item) => ({
        _id: item._id,
        targetType: type,
        name: targetDisplay(type, item).name,
        email: targetDisplay(type, item).email,
        phone: targetDisplay(type, item).phone,
        onboardingStatus: item.onboardingStatus || item.onboarding_status || '',
        agreementStatus: item.agreementStatus || '',
        accountStatus: item.accountStatus || '',
        isActive: item.isActive,
        isSuspended: item.isSuspended,
        agencyApprovalStatus: item.agencyApprovalStatus || '',
        adminApprovalStatus: item.adminApprovalStatus || '',
        createdAt: item.createdAt,
      })),
      total,
      ...(targetType ? { pagination: paginationMeta(total, page, limit) } : {}),
    };
  }));

  return res.json({ success: true, data });
});

const resolveCurrentTarget = (user) => {
  const modelName = user?.constructor?.modelName;
  const roleCode = Number(user?.role?.code);
  const roleName = String(user?.role?.name || '').toLowerCase();

  if (modelName === 'Developer' || roleCode === 17 || roleName === 'developer') {
    return { targetType: 'developer', idField: 'developerId' };
  }
  if (modelName === 'Agency' || roleCode === 15 || roleName === 'agency') {
    return { targetType: 'agency', idField: 'agencyId' };
  }
  if (modelName === 'GridAgent' || roleCode === 16 || roleName === 'agent') {
    return { targetType: 'agent', idField: 'agentId' };
  }

  return null;
};

exports.getMyAgreements = asyncHandler(async (req, res) => {
  const target = resolveCurrentTarget(req.user);
  if (!target) {
    throw new APIError('Agreement access is available only for developers, agencies, and agents', StatusCodes.FORBIDDEN);
  }

  const { page, limit, skip } = paginate(req.query);
  const filter = {
    targetType: target.targetType,
    [target.idField]: req.user._id,
  };
  if (req.query.status) filter.status = req.query.status;

  const [agreements, total] = await Promise.all([
    AdminAgreement.find(filter)
      .populate('developerId', 'companyName name email phone_number onboardingStatus accountStatus')
      .populate('agencyId', 'companyName primaryContactName primaryContactEmail primaryContactPhone agreementStatus onboardingStatus isActive isSuspended')
      .populate('agentId', 'first_name last_name fullName email phone_number agencyApprovalStatus adminApprovalStatus agency')
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AdminAgreement.countDocuments(filter),
  ]);

  return res.json({
    success: true,
    data: agreements,
    pagination: paginationMeta(total, page, limit),
  });
});

exports.createAgreement = asyncHandler(async (req, res) => {
  const targetType = normalizeTargetType(req.body.targetType || req.body.partyType);
  const targetId = ensureObjectId(
    req.body.targetId || req.body[`${targetType}Id`],
    `${targetType}Id`
  );
  const target = await getTarget(targetType, targetId);
  const documents = collectDocuments(req);

  if (!documents.length) {
    throw new APIError('At least one agreement document file or URL is required', StatusCodes.BAD_REQUEST);
  }

  const extraParties = parseJson(req.body.parties, []);
  const agreement = await AdminAgreement.create({
    targetType,
    [TARGET_ID_FIELD[targetType]]: target._id,
    title: req.body.title || req.body.name || 'Agreement',
    agreementType: req.body.agreementType || 'main_agreement',
    parties: buildParties(targetType, target, Array.isArray(extraParties) ? extraParties : []),
    documents,
    status: req.body.status || 'uploaded',
    effectiveDate: req.body.effectiveDate ? new Date(req.body.effectiveDate) : new Date(),
    expiryDate: req.body.expiryDate ? new Date(req.body.expiryDate) : null,
    version: Number(req.body.version) || 1,
    notes: req.body.notes || '',
    createdBy: req.user._id,
  });

  await syncEmbeddedAgreement(targetType, target, agreement, documents);
  const partnerAgreement = await syncPartnerAgreement(targetType, target, agreement, documents, req);

const GridNotification = require('../../Notification/GridNotificationmodal').default;
const agreementVersion = Number(req.body.version) || 1;

if (agreementVersion > 1) {

  if (targetType === 'agency' && target._id) {
    await GridNotification.create({
      eventType:      'NEW_AGREEMENT_VERSION_REQUIRED',
      title:          `New Partner Agreement Version Available 📄 (v${agreementVersion})`,
      message:        `A new version (v${agreementVersion}) of the Partner Agreement has been issued by Xoto Admin. Please review and sign before your current agreement expires.`,
      entityId:       agreement._id,
      entityModel:    'AdminAgreement',
      recipientId:    target._id,
      recipientModel: 'Agency',
      recipientRole:  'partner',
      createdByName:  'Xoto Admin',
      createdByRole:  'admin',
    }).catch(err => console.error('New agreement version (agency) notification failed:', err.message));
  }

  if (targetType === 'agent' && target._id) {
    await GridNotification.create({
      eventType:      'NEW_AGREEMENT_VERSION_REQUIRED',
      title:          `New Partner Agreement Version Available 📄 (v${agreementVersion})`,
      message:        `A new version (v${agreementVersion}) of your Partner Agreement has been issued. Please review and sign the updated agreement before your current one expires.`,
      entityId:       agreement._id,
      entityModel:    'AdminAgreement',
      recipientId:    target._id,
      recipientModel: 'GridAgent',
      recipientRole:  'agent',
      createdByName:  'Xoto Admin',
      createdByRole:  'admin',
    }).catch(err => console.error('New agreement version (agent) notification failed:', err.message));
  }
}
  return res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Agreement uploaded successfully',
    data: agreement,
    partnerAgreementId: partnerAgreement?._id || null,
  });
});

exports.getAgreements = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const filter = buildListFilter(req.query);
  const sortDir = req.query.sortOrder === 'asc' ? 1 : -1;

  const [agreements, total] = await Promise.all([
    AdminAgreement.find(filter)
      .populate('developerId', 'companyName name email phone_number onboardingStatus accountStatus')
      .populate('agencyId', 'companyName primaryContactName primaryContactEmail primaryContactPhone agreementStatus onboardingStatus isActive isSuspended')
      .populate('agentId', 'first_name last_name fullName email phone_number agencyApprovalStatus adminApprovalStatus agency')
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: sortDir })
      .skip(skip)
      .limit(limit)
      .lean(),
    AdminAgreement.countDocuments(filter),
  ]);

  return res.json({
    success: true,
    data: agreements,
    pagination: paginationMeta(total, page, limit),
  });
});

exports.getAgreementById = asyncHandler(async (req, res) => {
  const agreement = await AdminAgreement.findById(req.params.id)
    .populate('developerId', 'companyName name email phone_number onboardingStatus accountStatus')
    .populate('agencyId', 'companyName primaryContactName primaryContactEmail primaryContactPhone agreementStatus onboardingStatus isActive isSuspended')
    .populate('agentId', 'first_name last_name fullName email phone_number agencyApprovalStatus adminApprovalStatus agency')
    .populate('createdBy', 'firstName lastName email')
    .populate('updatedBy', 'firstName lastName email');

  if (!agreement) {
    throw new APIError('Agreement not found', StatusCodes.NOT_FOUND);
  }

  return res.json({ success: true, data: agreement });
});

exports.updateAgreement = asyncHandler(async (req, res) => {
  const agreement = await AdminAgreement.findById(req.params.id);
  if (!agreement) {
    throw new APIError('Agreement not found', StatusCodes.NOT_FOUND);
  }

  const target = await getTarget(agreement.targetType, agreement[TARGET_ID_FIELD[agreement.targetType]]);
  const documents = collectDocuments(req);

  ['title', 'agreementType', 'status', 'notes'].forEach((field) => {
    if (req.body[field] !== undefined) agreement[field] = req.body[field];
  });
  if (req.body.effectiveDate !== undefined) agreement.effectiveDate = new Date(req.body.effectiveDate);
  if (req.body.expiryDate !== undefined) {
    agreement.expiryDate = req.body.expiryDate ? new Date(req.body.expiryDate) : null;
  }
  if (req.body.version !== undefined) agreement.version = Number(req.body.version) || agreement.version;

  if (documents.length) {
    agreement.documents.push(...documents);
    await syncEmbeddedAgreement(agreement.targetType, target, agreement, documents);
    await syncPartnerAgreement(agreement.targetType, target, agreement, documents, req);
  }

  if (req.body.status !== undefined) {
    await syncVerificationStatus(agreement.targetType, target, agreement.status, req.user._id);
  }

  agreement.updatedBy = req.user._id;
  await agreement.save();

  return res.json({
    success: true,
    message: 'Agreement updated successfully',
    data: agreement,
  });
});

exports.archiveAgreement = asyncHandler(async (req, res) => {
  const agreement = await AdminAgreement.findById(req.params.id);
  if (!agreement) {
    throw new APIError('Agreement not found', StatusCodes.NOT_FOUND);
  }

  agreement.status = 'archived';
  agreement.updatedBy = req.user._id;
  await agreement.save();

  return res.json({
    success: true,
    message: 'Agreement archived successfully',
    data: agreement,
  });
});
