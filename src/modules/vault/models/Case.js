import mongoose from 'mongoose';

// ══════════════════════════════════════════════════════════════════
// EMBEDDED SCHEMAS
// ══════════════════════════════════════════════════════════════════

const clientPersonalSchema = new mongoose.Schema(
  {
    fullName:         { type: String, default: null },
    email:            { type: String, default: null, lowercase: true },
    mobile:           { type: String, default: null },
    nationality:      { type: String, default: null },
    residencyStatus:  { type: String, default: null },
    employmentStatus: { type: String, default: null },
    dateOfBirth:      { type: Date,   default: null },
    employer:         { type: String, default: null },
    monthlySalary:    { type: Number, default: null },
  },
  { _id: false }
);

const propertySchema = new mongoose.Schema(
  {
    propertyValue:   { type: Number, default: null },
    loanAmount:      { type: Number, default: null },
    downPayment:     { type: Number, default: null },
    tenureYears:     { type: Number, default: 25 },
    propertyType:    { type: String, default: null },
    transactionType: { type: String, default: null },
    propertyAddress: {
      area: { type: String, default: null },
      city: { type: String, default: 'Dubai' },
    },
  },
  { _id: false }
);

const bankSelectionSchema = new mongoose.Schema(
  {
    bankId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Bank', default: null },
    bankName:     { type: String, default: null },
    productId:    { type: mongoose.Schema.Types.ObjectId, ref: 'BankMortgageProducts', default: null },
    productName:  { type: String, default: null },
    interestRate: { type: Number, default: null },
    tenureYears:  { type: Number, default: 25 },
    monthlyEMI:   { type: Number, default: null },
  },
  { _id: false }
);

const eligibilitySnapshotSchema = new mongoose.Schema(
  {
    checkedAt:             { type: Date,    default: null },
    isEligible:            { type: Boolean, default: false },
    dbrPercentage:         { type: Number,  default: 0 },
    dbrStatus:             { type: String,  default: 'Not Checked' },
    estimatedLTV:          { type: Number,  default: 0 },
    eligibilityScore:      { type: Number,  default: 0 },
    riskGrade:             { type: String,  default: null },
    recommendedLoanAmount: { type: Number,  default: 0 },
    eligibilityNotes:      { type: String,  default: null },
    monthlySalary:         { type: Number,  default: null },
    existingMonthlyDebt:   { type: Number,  default: null },
  },
  { _id: false }
);

// ── Document Summary ─────────────────────────────────────────────
// Tracks upload/verify counts per handler type
// Advisor cases: handledBy = Advisor | Ops
// Partner cases: handledBy = Partner (no Ops involved)
const documentSummarySchema = new mongoose.Schema(
  {
    totalRequired: { type: Number, default: 0 },
    uploadedCount: { type: Number, default: 0 },
    verifiedCount: { type: Number, default: 0 },
    completionPercentage: { type: Number, default: 0 },
    allUploaded: { type: Boolean, default: false },
    allVerified: { type: Boolean, default: false },
    // Advisor-handled docs (customer documents)
    advisorRequired: { type: Number, default: 0 },
    advisorUploaded: { type: Number, default: 0 },
    // Ops-handled docs (bank forms — advisor cases only)
    opsRequired: { type: Number, default: 0 },
    opsUploaded: { type: Number, default: 0 },
    // Partner-handled docs (partner cases only — no Ops involved)
    // Other-handled docs (partner / partner agent / external users)
    otherRequired: { type: Number, default: 0 },
    otherUploaded: { type: Number, default: 0 },
  },
  { _id: false }
);

// ── Ops Queue ─────────────────────────────────────────────────────
// Only used for advisor-created cases
// Partner cases skip Ops entirely
const opsQueueSchema = new mongoose.Schema(
  {
    enteredQueueAt: { type: Date, default: null },
    pickedUpBy: {
      opsId: { type: mongoose.Schema.Types.ObjectId, ref: 'MortgageOps', default: null },
      opsName: { type: String, default: null },
      pickedUpAt: { type: Date, default: null },
    },
    returnedToQueue: {
      returnedAt: { type: Date, default: null },
      returnedBy: { type: String, default: null },
      reason: { type: String, default: null },
    },
    returnCount: { type: Number, default: 0 },
    adminAssigned: {
      assignedAt: { type: Date, default: null },
      assignedBy: { type: String, default: null },
    },
  },
  { _id: false }
);

// ── Bank Decision ─────────────────────────────────────────────────
const bankDecisionSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Conditional'], default: 'Pending' },
    approvedAmount: { type: Number, default: null },
    approvedRate: { type: Number, default: null },
    decisionDate: { type: Date, default: null },
    decisionNotes: { type: String, default: null },
    rejectionReason: { type: String, default: null },
  },
  { _id: false }
);

// ── Disbursement Info ────────────────────────────────────────────
// Filled by Ops after bank confirms disbursement
// disbursedAmount triggers commission creation
const disbursementInfoSchema = new mongoose.Schema(
  {
    disbursedAmount: { type: Number, default: null }, // actual amount disbursed
    approvedAmount: { type: Number, default: null }, // bank approved amount
    disbursementDate: { type: Date, default: null },
    disbursedTo: { type: String, default: null }, // developer / seller / existing bank
    disbursementRef: { type: String, default: null }, // bank transfer reference
    confirmedByOps: { type: Boolean, default: false },
    confirmedByOpsAt: { type: Date, default: null },
  },
  { _id: false }
);

// ── Timeline ──────────────────────────────────────────────────────
const timelineSchema = new mongoose.Schema(
  {
    createdAt: { type: Date, default: Date.now },
    submittedToXotoAt: { type: Date, default: null }, // advisor cases only
    assignedToOpsAt: { type: Date, default: null }, // advisor cases only
    submittedToBankAt: { type: Date, default: null }, // both flows
    preApprovedAt: { type: Date, default: null },
    valuationAt: { type: Date, default: null },
    folProcessedAt: { type: Date, default: null },
    folIssuedAt: { type: Date, default: null },
    folSignedAt: { type: Date, default: null },
    disbursedAt: { type: Date, default: null },
  },
  { _id: false }
);

// ══════════════════════════════════════════════════════════════════
// MAIN CASE SCHEMA
// ══════════════════════════════════════════════════════════════════
const caseSchema = new mongoose.Schema(
  {
    caseReference: { type: String, unique: true, required: true },

    // Lead this case was created from (required)
    sourceLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'VaultLead', required: true },

    // Proposal is optional — case can be created directly from qualified lead
    proposalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Proposal', default: null },

    // Parent partner organization (if created by a partner or partner agent)
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', default: null },

    // Who created this case
    // ALL cases go through Ops queue before bank submission
    // role: 'advisor'                  → Draft → Xoto → Ops Queue → Ops Review → Bank
    // role: 'partner'                  → Draft → Xoto → Ops Queue → Ops Review → Bank
    // role: 'partner_affiliated_agent' → Draft → Xoto → Ops Queue → Ops Review → Bank
    // role: 'admin'                    → admin-created, same flow
    createdBy: {
      role: { type: String, enum: ['advisor', 'partner', 'admin', 'partner_affiliated_agent'], required: true },
      userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      userName: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    },

    // Advisor-only: if true, bank form docs stay with Ops; advisor only uploads global docs
    advisorSkipBankForm: { type: Boolean, default: false },

    clientInfo:    { type: clientPersonalSchema,   default: () => ({}) },
    propertyInfo:  { type: propertySchema,         default: () => ({}) },
    bankSelection: { type: bankSelectionSchema,    default: () => ({}) },
    eligibilitySnapshot: { type: eligibilitySnapshotSchema, default: () => ({}) },
    documentSummary: { type: documentSummarySchema, default: () => ({}) },
    opsQueue: { type: opsQueueSchema, default: () => ({}) },
    timeline: { type: timelineSchema, default: () => ({ createdAt: new Date() }) },
    bankDecision: { type: bankDecisionSchema, default: () => ({}) },
    disbursementInfo: { type: disbursementInfoSchema, default: () => ({}) },

    // ── Status ───────────────────────────────────────────────────
    // ALL roles follow the same flow:
    //   Draft → Submitted to Xoto → In Ops Queue - Pending Pick-up
    //   → Assigned - Pending Review → Under Review
    //   → [Returned - Pending Correction] → Submitted to Bank → ...
    currentStatus: {
      type: String,
      enum: [
        'Draft',
        'Submitted to Xoto',              // Both advisor and partner cases
        'In Ops Queue - Pending Pick-up', // Both advisor and partner cases
        'Assigned - Pending Review',     // Both advisor and partner cases
        'Under Review',                   // Both advisor and partner cases
        'Returned - Pending Correction',  // Both advisor and partner cases
        'Resubmitted-After Correction',   // Advisor cases only
        'Submitted to Bank',              // Both flows meet here
        'Bank Application',
        'Pre-Approved',
        'Valuation',
        'FOL Processed',
        'FOL Issued',
        'FOL Signed',
        'Disbursed',
        'Lost',
        'Declined',
        'Rejected',
      ],
      default: 'Draft',
    },

    internalNotes: [{ type: String }],
    customerNotes: [{ type: String }],

    advisorSubmittedAt: { type: Date, default: null },
    resubmissionCount: { type: Number, default: 0 },
    notesToOps: { type: String, default: null },

    bankSubmission: {
      submittedToBankAt: { type: Date, default: null },
      bankReferenceNumber: { type: String, default: null },
      bankNotes: { type: String, default: null },
    },

    // Amount tracking (for dashboard)
    amountTracking: {
      requestedAmount: { type: Number, default: null },
      approvedAmount: { type: Number, default: null },
      disbursedAmount: { type: Number, default: null },
      amountStatus: { type: String, enum: ['Pending', 'Partially Approved', 'Approved', 'Disbursed'], default: 'Pending' },
    },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ══════════════════════════════════════════════════════════════════
// INDEXES
// ══════════════════════════════════════════════════════════════════
caseSchema.index({ caseReference: 1 }, { unique: true });
caseSchema.index({ sourceLeadId: 1 });
caseSchema.index({ partnerId: 1 });
caseSchema.index({ currentStatus: 1 });
caseSchema.index({ 'opsQueue.pickedUpBy.opsId': 1 });
caseSchema.index({ 'createdBy.userId': 1 });
caseSchema.index({ 'createdBy.role': 1 });
caseSchema.index({ createdAt: -1 });

// ══════════════════════════════════════════════════════════════════
// HELPER
// ══════════════════════════════════════════════════════════════════
function calculateEMI(principal, annualRate, tenureYears) {
  if (!principal || !annualRate || !tenureYears) return 0;
  const r = annualRate / 100 / 12;
  const n = tenureYears * 12;
  return Math.round(principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
}

// ══════════════════════════════════════════════════════════════════
// METHOD — Document Summary
// Aggregates from CaseDocumentRequirement collection
// Handles all three handler types: Advisor, Ops, Other
// ══════════════════════════════════════════════════════════════════
caseSchema.methods.updateDocumentSummary = async function () {
  try {
    const CaseDocumentRequirement = mongoose.model('CaseDocumentRequirement');

    const stats = await CaseDocumentRequirement.aggregate([
      { $match: { caseId: this._id, isDeleted: false } },
      {
        $group: {
          _id: null,
          totalRequired: { $sum: 1 },
          uploadedCount: { $sum: { $cond: ['$isUploaded', 1, 0] } },
          verifiedCount: { $sum: { $cond: ['$isVerified', 1, 0] } },
          // Advisor-handled
          advisorRequired: { $sum: { $cond: [{ $eq: ['$handledBy', 'Advisor'] }, 1, 0] } },
          advisorUploaded: { $sum: { $cond: [{ $and: [{ $eq: ['$handledBy', 'Advisor'] }, { $eq: ['$isUploaded', true] }] }, 1, 0] } },
          // Ops-handled (advisor cases only)
          opsRequired: { $sum: { $cond: [{ $eq: ['$handledBy', 'Ops'] }, 1, 0] } },
          opsUploaded: { $sum: { $cond: [{ $and: [{ $eq: ['$handledBy', 'Ops'] }, { $eq: ['$isUploaded', true] }] }, 1, 0] } },
          // Partner-handled (partner cases only)
          // Other-handled (partner / external creator cases)
          otherRequired: {
            $sum: {
              $cond: [{ $eq: ['$handledBy', 'Other'] }, 1, 0]
            }
          },

          otherUploaded: {
            $sum: {
              $cond: [{
                $and: [
                  { $eq: ['$handledBy', 'Other'] },
                  { $eq: ['$isUploaded', true] }
                ]
              }, 1, 0]
            }
          },
        },
      },
    ]);

    const s = stats[0] || {};
    this.documentSummary = {
      totalRequired: s.totalRequired || 0,
      uploadedCount: s.uploadedCount || 0,
      verifiedCount: s.verifiedCount || 0,
      completionPercentage: s.totalRequired > 0
        ? Math.round((s.uploadedCount / s.totalRequired) * 100) : 0,
      allUploaded: (s.uploadedCount || 0) > 0 && (s.uploadedCount || 0) === (s.totalRequired || 0),
      allVerified: (s.verifiedCount || 0) > 0 && (s.verifiedCount || 0) === (s.totalRequired || 0),
      advisorRequired: s.advisorRequired || 0,
      advisorUploaded: s.advisorUploaded || 0,
      opsRequired: s.opsRequired || 0,
      opsUploaded: s.opsUploaded || 0,
      otherRequired: s.otherRequired || 0,
      otherUploaded: s.otherUploaded || 0,
    };

    await this.save();
    return this.documentSummary;
  } catch (err) {
    console.error('updateDocumentSummary:', err);
    return this.documentSummary;
  }
};

// ══════════════════════════════════════════════════════════════════
// METHOD — Check if ready for submission
// Advisor case → checks Advisor-handled docs only
// Partner case → checks Partner-handled docs only
// ══════════════════════════════════════════════════════════════════
caseSchema.methods.isReadyForSubmission = async function () {
  try {
    const CaseDocumentRequirement = mongoose.model('CaseDocumentRequirement');
    const isOtherRole =
      ['partner', 'partner_affiliated_agent']
        .includes(this.createdBy.role);

    const handler =
      isOtherRole ? 'Other' : 'Advisor';
    const matchQuery = { caseId: this._id, handledBy: handler, isUploaded: false, isDeleted: false };

    // Advisor who skipped bank form only needs Global docs uploaded before submitting to Xoto
    if (this.createdBy.role === 'advisor' && this.advisorSkipBankForm) {
      matchQuery.source = 'Global';
    }

    const pending = await CaseDocumentRequirement.countDocuments(matchQuery);
    return pending === 0;
  } catch (err) {
    console.error('isReadyForSubmission:', err);
    return false;
  }
};

// ══════════════════════════════════════════════════════════════════
// METHOD — Advisor submits to Xoto Ops queue
// Blocked for partner cases
// ══════════════════════════════════════════════════════════════════
caseSchema.methods.submitToXoto = async function () {
  const isReady = await this.isReadyForSubmission();
  if (!isReady)
    throw new Error('All required documents must be uploaded before submitting');

  this.currentStatus = 'Submitted to Xoto';
  this.timeline.submittedToXotoAt = new Date();
  this.advisorSubmittedAt = new Date();
  return this.save();
};


// ══════════════════════════════════════════════════════════════════
// METHODS — Ops Queue (advisor cases only)
// ══════════════════════════════════════════════════════════════════

caseSchema.methods.enterOpsQueue = async function () {
  if (this.currentStatus !== 'Submitted to Xoto')
    throw new Error('Case must be Submitted to Xoto before entering Ops queue');
  this.currentStatus = 'In Ops Queue - Pending Pick-up';
  this.opsQueue.enteredQueueAt = new Date();
  this.opsQueue.returnCount = 0;
  return this.save();
};

caseSchema.methods.pickUpFromQueue = async function (opsId, opsName) {
  if (this.currentStatus !== 'In Ops Queue - Pending Pick-up')
    throw new Error('Case is not in the Ops queue');
  this.currentStatus = 'Assigned - Pending Review';
  this.opsQueue.pickedUpBy = { opsId, opsName, pickedUpAt: new Date() };
  this.timeline.assignedToOpsAt = new Date();
  return this.save();
};

caseSchema.methods.returnToQueue = async function (opsId, opsName, reason) {
  if (this.currentStatus !== 'Assigned - Pending Review')
    throw new Error('Only assigned cases can be returned to queue');
  if (!reason?.trim()) throw new Error('Reason required to return case to queue');
  this.currentStatus = 'In Ops Queue - Pending Pick-up';
  this.opsQueue.returnedToQueue = { returnedAt: new Date(), returnedBy: opsId, reason };
  this.opsQueue.returnCount = (this.opsQueue.returnCount || 0) + 1;
  this.opsQueue.pickedUpBy = { opsId: null, opsName: null, pickedUpAt: null };
  return this.save();
};

caseSchema.methods.adminAssignToOps = async function (opsId, opsName, adminName) {
  if (this.currentStatus !== 'In Ops Queue - Pending Pick-up')
    throw new Error('Case must be in queue for manual assignment');
  this.currentStatus = 'Assigned - Pending Review';
  this.opsQueue.pickedUpBy = { opsId, opsName, pickedUpAt: new Date() };
  this.opsQueue.adminAssigned = { assignedAt: new Date(), assignedBy: adminName };
  this.timeline.assignedToOpsAt = new Date();
  return this.save();
};

// ══════════════════════════════════════════════════════════════════
// METHODS — Ops Document Review (advisor cases only)
// ══════════════════════════════════════════════════════════════════

caseSchema.methods.startReview = async function () {
  if (this.currentStatus !== 'Assigned - Pending Review')
    throw new Error('Case must be assigned before review can start');
  this.currentStatus = 'Under Review';
  return this.save();
};

caseSchema.methods.returnToAdvisor = async function (reason) {
  if (!['Under Review', 'Assigned - Pending Review'].includes(this.currentStatus))
    throw new Error('Case must be under review to return to advisor');
  if (!reason?.trim()) throw new Error('Reason required');
  this.currentStatus = 'Returned - Pending Correction';
  this.internalNotes.push(`Returned to advisor: ${reason} — ${new Date().toISOString()}`);
  return this.save();
};

caseSchema.methods.resubmitAfterCorrection = async function () {
  if (this.currentStatus !== 'Returned - Pending Correction')
    throw new Error('Case must be in Returned status to resubmit');
  this.currentStatus = 'Resubmitted-After Correction';
  this.resubmissionCount = (this.resubmissionCount || 0) + 1;
  return this.save();
};

// ══════════════════════════════════════════════════════════════════
// METHODS — Bank submission + status updates (both flows)
// ══════════════════════════════════════════════════════════════════

caseSchema.methods.submitToBank = async function (bankRef, bankNotes) {
  const allowedStatuses = ['Under Review', 'Assigned - Pending Review', 'Submitted to Xoto'];
  if (!allowedStatuses.includes(this.currentStatus))
    throw new Error(`Cannot submit to bank from status: ${this.currentStatus}`);
  if (!this.documentSummary.allVerified)
    throw new Error('All documents must be verified before bank submission');

  this.currentStatus = 'Submitted to Bank';
  this.timeline.submittedToBankAt = new Date();
  this.bankSubmission.submittedToBankAt = new Date();
  if (bankRef) this.bankSubmission.bankReferenceNumber = bankRef;
  if (bankNotes) this.bankSubmission.bankNotes = bankNotes;
  return this.save();
};

caseSchema.methods.updateBankStatus = async function (status, data = {}) {
  const validStatuses = [
    'Bank Application', 'Pre-Approved', 'Valuation',
    'FOL Processed', 'FOL Issued', 'FOL Signed',
    'Rejected', 'Lost',
  ];
  if (!validStatuses.includes(status))
    throw new Error(`Invalid bank status: ${status}`);

  this.currentStatus = status;

  if (status === 'Pre-Approved') {
    this.timeline.preApprovedAt = new Date();
    this.bankDecision.status = 'Approved';
    this.bankDecision.approvedAmount = data.approvedAmount || null;
    this.bankDecision.approvedRate = data.approvedRate || null;
    this.bankDecision.decisionDate = new Date();
    this.bankDecision.decisionNotes = data.notes || null;
    this.disbursementInfo.approvedAmount = data.approvedAmount || null;
    this.amountTracking.approvedAmount = data.approvedAmount || null;
    this.amountTracking.amountStatus = 'Approved';
  }
  if (status === 'Valuation') this.timeline.valuationAt = new Date();
  if (status === 'FOL Processed') this.timeline.folProcessedAt = new Date();
  if (status === 'FOL Issued') this.timeline.folIssuedAt = new Date();
  if (status === 'FOL Signed') this.timeline.folSignedAt = new Date();
  if (status === 'Rejected') {
    this.bankDecision.status = 'Rejected';
    this.bankDecision.rejectionReason = data.reason || null;
    this.bankDecision.decisionDate = new Date();
  }

  return this.save();
};

// ── Ops marks disbursed — triggers commission creation ────────────
caseSchema.methods.markDisbursed = async function (disbursedAmount, disbursementRef, disbursedTo) {
  if (!disbursedAmount || disbursedAmount <= 0)
    throw new Error('Valid disbursed amount is required');
  if (this.currentStatus !== 'FOL Signed')
    throw new Error('Case must be FOL Signed before marking disbursed');

  this.currentStatus = 'Disbursed';
  this.timeline.disbursedAt = new Date();
  this.disbursementInfo.disbursedAmount = disbursedAmount;
  this.disbursementInfo.disbursementDate = new Date();
  this.disbursementInfo.disbursementRef = disbursementRef || null;
  this.disbursementInfo.disbursedTo = disbursedTo || null;
  this.disbursementInfo.confirmedByOps = true;
  this.disbursementInfo.confirmedByOpsAt = new Date();
  this.amountTracking.disbursedAmount = disbursedAmount;
  this.amountTracking.amountStatus = 'Disbursed';

  return this.save();
};

// ══════════════════════════════════════════════════════════════════
// PRE-SAVE — auto-calculate EMI if missing
// ══════════════════════════════════════════════════════════════════
caseSchema.pre('save', function (next) {
  if (this.bankSelection && this.propertyInfo?.loanAmount) {
    if (!this.bankSelection.monthlyEMI || this.bankSelection.monthlyEMI === 0) {
      this.bankSelection.monthlyEMI = calculateEMI(
        this.propertyInfo.loanAmount,
        this.bankSelection.interestRate,
        this.bankSelection.tenureYears
      );
    }
  }
  // Sync amountTracking.requestedAmount if not set
  if (!this.amountTracking?.requestedAmount && this.propertyInfo?.loanAmount) {
    if (!this.amountTracking) this.amountTracking = {};
    this.amountTracking.requestedAmount = this.propertyInfo.loanAmount;
  }
  next();
});

const Case = mongoose.models.Case || mongoose.model('Case', caseSchema);
export default Case;