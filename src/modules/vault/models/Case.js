const mongoose = require('mongoose');

// ─── Sub-schema: Single Document Slot ────────────────────────────────────────
const documentSlotSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },               // e.g. "Bank Statement"
    files: [
      {
        url: { type: String, required: true },
        fileName: { type: String, default: null },
        uploadedAt: { type: Date, default: Date.now },
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          refPath: 'uploadedByType',
          default: null,
        },
        uploadedByType: {
          type: String,
          enum: ['Agent', 'Partner'],
          default: null,
        },
      },
    ],
    status: {
      type: String,
      enum: ['Pending', 'Uploaded', 'Rejected'],
      default: 'Pending',
    },
    rejectionReason: { type: String, default: null },
    isMandatory: { type: Boolean, default: true },
  },
  { _id: true }
);

// ─── Sub-schema: Bank Form ────────────────────────────────────────────────────
const bankFormSchema = new mongoose.Schema(
  {
    bankFormId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankForm',
      required: true,
    },
    bankId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankProduct',
      default: null,
    },
    bankName: { type: String, required: true },
    formName: { type: String, required: true },
    downloadedAt: { type: Date, default: null },
    downloadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'bankForms.downloadedByType',
      default: null,
    },
    downloadedByType: {
      type: String,
      enum: ['Agent', 'Partner'],
      default: null,
    },
    uploadedFileUrl: { type: String, default: null },       // completed form re-uploaded
    uploadedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['Pending Download', 'Downloaded', 'Uploaded', 'Rejected'],
      default: 'Pending Download',
    },
    rejectionReason: { type: String, default: null },
  },
  { _id: true }
);

// ─── Sub-schema: Status History ───────────────────────────────────────────────
const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    updatedByType: {
      type: String,
      enum: ['Agent', 'Partner', 'Admin'],
      default: 'Admin',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    updatedAt: { type: Date, default: Date.now },
    notes: { type: String, default: null },
  },
  { _id: false }
);

// ─── Sub-schema: Bank Entry in a Case ────────────────────────────────────────
const caseBankSchema = new mongoose.Schema(
  {
    bankProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankProduct',
      default: null,
    },
    bankName: { type: String, required: true },
    loanAmount: { type: Number, default: null },
    isPrimary: { type: Boolean, default: false },
    status: {
      type: String,
      enum: [
        'Draft',
        'Submitted to Xoto',
        'New',
        'Contacted',
        'Qualified',
        'Collecting Documentation',
        'Bank Application',
        'Pre-Approved',
        'Valuation',
        'FOL Processed',
        'FOL Issued',
        'FOL Signed',
        'Disbursed',
        'Lost',
      ],
      default: 'Draft',
    },
  },
  { _id: true }
);

// ─── Main Case Schema ─────────────────────────────────────────────────────────
const caseSchema = new mongoose.Schema(
  {
    // ── Ownership ─────────────────────────────────────────────────────────────
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partner',
      required: true,
    },
    agentId: {
      // set if the case was submitted by a Partner-Affiliated Agent
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      default: null,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
    },

    // ── Step 1: Client Basic Information ──────────────────────────────────────
    clientInfo: {
      firstName: { type: String, required: true, trim: true },
      lastName: { type: String, required: true, trim: true },
      email: { type: String, required: true, trim: true, lowercase: true },
      phone: {
        country_code: { type: String, default: '+971' },
        number: { type: String, required: true, trim: true },
      },
      dateOfBirth: { type: Date, default: null },
      nationality: { type: String, default: null },
      residencyStatus: {
        type: String,
        enum: ['UAE Resident', 'Non-Resident'],
        required: true,
      },
      employmentStatus: {
        type: String,
        enum: ['Salaried', 'Self-Employed'],
        required: true,
      },
      monthlySalary: { type: Number, required: true },
      salaryBankName: { type: String, default: null },     // salary account bank
      mortgageTerm: { type: Number, required: true },       // years (5–25)
      propertyValue: { type: Number, required: true },      // AED
      feeFinancingRequired: { type: Boolean, default: false },
    },

    // ── Step 2: Documents — Salaried ─────────────────────────────────────────
    // All document slots are present regardless of employment type;
    // isMandatory flags control which are required for submission
    salariedDocuments: {
      bankStatements: documentSlotSchema,          // last 6 months
      emiratesIdFront: documentSlotSchema,
      emiratesIdBack: documentSlotSchema,
      passport: documentSlotSchema,               // all pages
      visaCopy: documentSlotSchema,
      salaryCertificate: documentSlotSchema,      // on company letterhead
      payslips: documentSlotSchema,               // only if salary varied
    },

    // ── Step 2: Documents — Self-Employed ─────────────────────────────────────
    selfEmployedDocuments: {
      tradeLicense: documentSlotSchema,
      moa: documentSlotSchema,                    // all versions since incorporation
      utilityBills: documentSlotSchema,           // within 3 months
      ejari: documentSlotSchema,                  // current tenancy
      companyProfile: documentSlotSchema,
      companyBankStatement: documentSlotSchema,   // last 12 months
      personalBankStatement: documentSlotSchema,  // last 12 months
      employeeList: documentSlotSchema,
      companyWebsite: {
        url: { type: String, default: null },
        screenshotUrl: { type: String, default: null },
      },
      auditReport: documentSlotSchema,            // last 2 financial years
      vatReturnReports: documentSlotSchema,       // last 4 quarters
      vatRegistrationCertificate: documentSlotSchema,
    },

    // ── Step 3: Bank Forms ────────────────────────────────────────────────────
    bankForms: [bankFormSchema],

    // ── Step 4: Banks Selected ────────────────────────────────────────────────
    banks: [caseBankSchema],

    // ── Submission ────────────────────────────────────────────────────────────
    submissionNotes: { type: String, default: null },
    submittedAt: { type: Date, default: null },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'submittedByType',
      default: null,
    },
    submittedByType: {
      type: String,
      enum: ['Agent', 'Partner'],
      default: null,
    },

    // ── Overall Case Status ───────────────────────────────────────────────────
    status: {
      type: String,
      enum: [
        'Draft',
        'Submitted to Xoto',
        'New',
        'Contacted',
        'Qualified',
        'Collecting Documentation',
        'Bank Application',
        'Pre-Approved',
        'Valuation',
        'FOL Processed',
        'FOL Issued',
        'FOL Signed',
        'Disbursed',
        'Lost',
      ],
      default: 'Draft',
    },
    statusHistory: [statusHistorySchema],

    // ── Commission ────────────────────────────────────────────────────────────
    commissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Commission',
      default: null,
    },

    // ── Soft Delete ───────────────────────────────────────────────────────────
    is_deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

caseSchema.index({ partnerId: 1 });
caseSchema.index({ agentId: 1 });
caseSchema.index({ clientId: 1 });
caseSchema.index({ status: 1 });
caseSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Case', caseSchema);