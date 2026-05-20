// seed/globalDocuments.js
// Run with: node seed/globalDocuments.js

const mongoose = require('mongoose');
require('dotenv').config();

// Document Requirement Model (adjust path as needed)
const DocumentRequirement = require('../modules/mortgages/models/Bankproductdocuments');

const globalDocuments = [
  // ==================== IDENTITY DOCUMENTS ====================
  {
    documentName: "Valid Passport Copy",
    documentKey: "passport",
    description: "Clear copy of valid passport with photo page and signature",
    category: "Identity",
    documentType: "direct_upload",
    isGlobal: true,
    applicableEmploymentTypes: ["Salaried", "Self-Employed", "Both"],
    applicableResidencyStatuses: ["UAE National", "UAE Resident", "Non-Resident", "All"],
    applicableMortgageTypes: ["Islamic", "Conventional", "Both"],
    isMandatory: true,
    requiresFrontBack: false,
    requiresTranslation: false,
    requiresAttestation: false,
    requiresSignature: false,
    requiresStamp: false,
    allowMultipleFiles: false,
    maxFilesAllowed: 1,
    allowedFileTypes: ["pdf", "jpg", "jpeg", "png"],
    maxFileSizeMB: 10,
    placeholderText: "Click or drag passport copy here",
    helperText: "Please ensure the passport is valid for at least 6 months",
    instructions: "Upload clear color copy of your passport's photo page",
    displayOrder: 1,
    status: "Active"
  },
  {
    documentName: "Emirates ID (Front & Back)",
    documentKey: "emirates_id",
    description: "Clear copy of Emirates ID - both front and back sides",
    category: "Identity",
    documentType: "direct_upload",
    isGlobal: true,
    applicableEmploymentTypes: ["Salaried", "Self-Employed", "Both"],
    applicableResidencyStatuses: ["UAE National", "UAE Resident"],
    applicableMortgageTypes: ["Islamic", "Conventional", "Both"],
    isMandatory: true,
    requiresFrontBack: true,
    requiresTranslation: false,
    requiresAttestation: false,
    requiresSignature: false,
    requiresStamp: false,
    allowMultipleFiles: true,
    maxFilesAllowed: 2,
    allowedFileTypes: ["pdf", "jpg", "jpeg", "png"],
    maxFileSizeMB: 10,
    placeholderText: "Upload Emirates ID (Front & Back)",
    helperText: "Please ensure both front and back are clear and readable",
    instructions: "Upload front and back copies of your Emirates ID",
    displayOrder: 2,
    status: "Active"
  },
  {
    documentName: "UAE Visa Copy",
    documentKey: "visa_copy",
    description: "Clear copy of UAE residence visa",
    category: "Identity",
    documentType: "direct_upload",
    isGlobal: true,
    applicableEmploymentTypes: ["Salaried", "Self-Employed", "Both"],
    applicableResidencyStatuses: ["UAE Resident"],
    applicableMortgageTypes: ["Islamic", "Conventional", "Both"],
    isMandatory: true,
    requiresFrontBack: false,
    requiresTranslation: false,
    requiresAttestation: false,
    requiresSignature: false,
    requiresStamp: false,
    allowMultipleFiles: false,
    maxFilesAllowed: 1,
    allowedFileTypes: ["pdf", "jpg", "jpeg", "png"],
    maxFileSizeMB: 10,
    placeholderText: "Upload visa copy",
    helperText: "Please ensure visa is valid",
    instructions: "Upload clear copy of your residence visa",
    displayOrder: 3,
    status: "Active"
  },

  // ==================== EMPLOYMENT DOCUMENTS ====================
  {
    documentName: "Salary Certificate",
    documentKey: "salary_certificate",
    description: "Official salary certificate from employer on company letterhead",
    category: "Income",
    documentType: "direct_upload",
    isGlobal: true,
    applicableEmploymentTypes: ["Salaried"],
    applicableResidencyStatuses: ["UAE National", "UAE Resident", "All"],
    applicableMortgageTypes: ["Islamic", "Conventional", "Both"],
    isMandatory: true,
    requiresFrontBack: false,
    requiresTranslation: false,
    requiresAttestation: true,
    requiresSignature: true,
    requiresStamp: true,
    allowMultipleFiles: false,
    maxFilesAllowed: 1,
    allowedFileTypes: ["pdf", "jpg", "jpeg", "png"],
    maxFileSizeMB: 10,
    placeholderText: "Upload salary certificate",
    helperText: "Must be on company letterhead with stamp and signature",
    instructions: "Upload official salary certificate from employer",
    displayOrder: 10,
    status: "Active"
  },
  {
    documentName: "Payslips (Last 3 Months)",
    documentKey: "payslips",
    description: "Last 3 months salary slips",
    category: "Income",
    documentType: "direct_upload",
    isGlobal: true,
    applicableEmploymentTypes: ["Salaried"],
    applicableResidencyStatuses: ["UAE National", "UAE Resident", "All"],
    applicableMortgageTypes: ["Islamic", "Conventional", "Both"],
    isMandatory: true,
    requiresFrontBack: false,
    requiresTranslation: false,
    requiresAttestation: false,
    requiresSignature: false,
    requiresStamp: false,
    allowMultipleFiles: true,
    maxFilesAllowed: 3,
    allowedFileTypes: ["pdf", "jpg", "jpeg", "png"],
    maxFileSizeMB: 10,
    placeholderText: "Upload payslips",
    helperText: "Upload last 3 months salary slips",
    instructions: "Upload salary slips for the last 3 months",
    displayOrder: 11,
    status: "Active"
  },
  {
    documentName: "Employment Contract",
    documentKey: "employment_contract",
    description: "Valid employment contract or offer letter",
    category: "Income",
    documentType: "direct_upload",
    isGlobal: true,
    applicableEmploymentTypes: ["Salaried"],
    applicableResidencyStatuses: ["UAE National", "UAE Resident", "All"],
    applicableMortgageTypes: ["Islamic", "Conventional", "Both"],
    isMandatory: false,
    requiresFrontBack: false,
    requiresTranslation: false,
    requiresAttestation: false,
    requiresSignature: false,
    requiresStamp: false,
    allowMultipleFiles: false,
    maxFilesAllowed: 1,
    allowedFileTypes: ["pdf", "jpg", "jpeg", "png"],
    maxFileSizeMB: 10,
    placeholderText: "Upload employment contract",
    helperText: "If available, upload your employment contract",
    instructions: "Upload your employment contract or offer letter",
    displayOrder: 12,
    status: "Active"
  },

  // ==================== FINANCIAL/BANKING DOCUMENTS ====================
  {
    documentName: "Bank Statements (Last 6 Months)",
    documentKey: "bank_statements",
    description: "Complete bank statements for salary account - last 6 months",
    category: "Banking",
    documentType: "direct_upload",
    isGlobal: true,
    applicableEmploymentTypes: ["Salaried", "Self-Employed", "Both"],
    applicableResidencyStatuses: ["UAE National", "UAE Resident", "Non-Resident", "All"],
    applicableMortgageTypes: ["Islamic", "Conventional", "Both"],
    isMandatory: true,
    requiresFrontBack: false,
    requiresTranslation: false,
    requiresAttestation: false,
    requiresSignature: false,
    requiresStamp: false,
    allowMultipleFiles: true,
    maxFilesAllowed: 6,
    allowedFileTypes: ["pdf", "jpg", "jpeg", "png"],
    maxFileSizeMB: 10,
    placeholderText: "Upload bank statements",
    helperText: "Upload all pages of last 6 months statements",
    instructions: "Upload 6 months bank statements showing salary credits",
    displayOrder: 20,
    status: "Active"
  },
  {
    documentName: "Credit Report (AECB)",
    documentKey: "credit_report",
    description: "Credit report from Al Etihad Credit Bureau",
    category: "Banking",
    documentType: "direct_upload",
    isGlobal: true,
    applicableEmploymentTypes: ["Salaried", "Self-Employed", "Both"],
    applicableResidencyStatuses: ["UAE National", "UAE Resident", "All"],
    applicableMortgageTypes: ["Islamic", "Conventional", "Both"],
    isMandatory: false,
    requiresFrontBack: false,
    requiresTranslation: false,
    requiresAttestation: false,
    requiresSignature: false,
    requiresStamp: false,
    allowMultipleFiles: false,
    maxFilesAllowed: 1,
    allowedFileTypes: ["pdf"],
    maxFileSizeMB: 5,
    placeholderText: "Upload AECB Credit Report",
    helperText: "Credit report from Al Etihad Credit Bureau",
    instructions: "Download your credit report from AECB and upload",
    displayOrder: 21,
    status: "Active"
  },

  // ==================== PROPERTY DOCUMENTS ====================
  {
    documentName: "Sales Agreement / Purchase Contract",
    documentKey: "sales_agreement",
    description: "Signed property sales agreement or purchase contract",
    category: "Property",
    documentType: "direct_upload",
    isGlobal: true,
    applicableEmploymentTypes: ["Salaried", "Self-Employed", "Both"],
    applicableResidencyStatuses: ["UAE National", "UAE Resident", "Non-Resident", "All"],
    applicableMortgageTypes: ["Islamic", "Conventional", "Both"],
    isMandatory: true,
    requiresFrontBack: false,
    requiresTranslation: false,
    requiresAttestation: false,
    requiresSignature: true,
    requiresStamp: false,
    allowMultipleFiles: false,
    maxFilesAllowed: 1,
    allowedFileTypes: ["pdf"],
    maxFileSizeMB: 10,
    placeholderText: "Upload Sales Agreement",
    helperText: "Upload signed sales agreement or purchase contract",
    instructions: "Upload signed sales agreement (SPA/MOU)",
    displayOrder: 30,
    status: "Active"
  },
  {
    documentName: "Title Deed / Property Registration",
    documentKey: "title_deed",
    description: "Title deed or property registration certificate",
    category: "Property",
    documentType: "direct_upload",
    isGlobal: true,
    applicableEmploymentTypes: ["Salaried", "Self-Employed", "Both"],
    applicableResidencyStatuses: ["UAE National", "UAE Resident", "Non-Resident", "All"],
    applicableMortgageTypes: ["Islamic", "Conventional", "Both"],
    isMandatory: true,
    requiresFrontBack: false,
    requiresTranslation: false,
    requiresAttestation: false,
    requiresSignature: false,
    requiresStamp: false,
    allowMultipleFiles: false,
    maxFilesAllowed: 1,
    allowedFileTypes: ["pdf"],
    maxFileSizeMB: 10,
    placeholderText: "Upload Title Deed",
    helperText: "Upload property title deed or registration certificate",
    instructions: "Upload the property title deed",
    displayOrder: 31,
    status: "Active"
  },

  // ==================== SELF-EMPLOYED DOCUMENTS ====================
  {
    documentName: "Trade License",
    documentKey: "trade_license",
    description: "Valid trade license for business",
    category: "Business",
    documentType: "direct_upload",
    isGlobal: true,
    applicableEmploymentTypes: ["Self-Employed"],
    applicableResidencyStatuses: ["UAE National", "UAE Resident", "All"],
    applicableMortgageTypes: ["Islamic", "Conventional", "Both"],
    isMandatory: true,
    requiresFrontBack: false,
    requiresTranslation: false,
    requiresAttestation: false,
    requiresSignature: false,
    requiresStamp: true,
    allowMultipleFiles: false,
    maxFilesAllowed: 1,
    allowedFileTypes: ["pdf"],
    maxFileSizeMB: 10,
    placeholderText: "Upload Trade License",
    helperText: "Upload valid trade license",
    instructions: "Upload your company trade license",
    displayOrder: 40,
    status: "Active"
  },
  {
    documentName: "Memorandum of Association (MOA)",
    documentKey: "moa",
    description: "Memorandum of Association and Articles of Association",
    category: "Business",
    documentType: "direct_upload",
    isGlobal: true,
    applicableEmploymentTypes: ["Self-Employed"],
    applicableResidencyStatuses: ["UAE National", "UAE Resident", "All"],
    applicableMortgageTypes: ["Islamic", "Conventional", "Both"],
    isMandatory: true,
    requiresFrontBack: false,
    requiresTranslation: false,
    requiresAttestation: false,
    requiresSignature: false,
    requiresStamp: false,
    allowMultipleFiles: false,
    maxFilesAllowed: 1,
    allowedFileTypes: ["pdf"],
    maxFileSizeMB: 10,
    placeholderText: "Upload MOA",
    helperText: "Upload Memorandum of Association",
    instructions: "Upload the company's MOA",
    displayOrder: 41,
    status: "Active"
  },
  {
    documentName: "Audited Financial Statements",
    documentKey: "audited_financials",
    description: "Audited financial statements for last 2 years",
    category: "Business",
    documentType: "direct_upload",
    isGlobal: true,
    applicableEmploymentTypes: ["Self-Employed"],
    applicableResidencyStatuses: ["UAE National", "UAE Resident", "All"],
    applicableMortgageTypes: ["Islamic", "Conventional", "Both"],
    isMandatory: true,
    requiresFrontBack: false,
    requiresTranslation: false,
    requiresAttestation: true,
    requiresSignature: false,
    requiresStamp: true,
    allowMultipleFiles: true,
    maxFilesAllowed: 2,
    allowedFileTypes: ["pdf"],
    maxFileSizeMB: 10,
    placeholderText: "Upload Audited Financials",
    helperText: "Upload audited financial statements",
    instructions: "Upload audited financial statements for last 2 years",
    displayOrder: 42,
    status: "Active"
  },
  {
    documentName: "Company Bank Statements (Last 12 Months)",
    documentKey: "company_bank_statements",
    description: "Company bank statements for last 12 months",
    category: "Banking",
    documentType: "direct_upload",
    isGlobal: true,
    applicableEmploymentTypes: ["Self-Employed"],
    applicableResidencyStatuses: ["UAE National", "UAE Resident", "All"],
    applicableMortgageTypes: ["Islamic", "Conventional", "Both"],
    isMandatory: true,
    requiresFrontBack: false,
    requiresTranslation: false,
    requiresAttestation: false,
    requiresSignature: false,
    requiresStamp: false,
    allowMultipleFiles: true,
    maxFilesAllowed: 12,
    allowedFileTypes: ["pdf"],
    maxFileSizeMB: 10,
    placeholderText: "Upload Company Bank Statements",
    helperText: "Upload 12 months company bank statements",
    instructions: "Upload company bank statements for last 12 months",
    displayOrder: 43,
    status: "Active"
  },

  // ==================== ADDITIONAL DOCUMENTS ====================
  {
    documentName: "No Objection Certificate (NOC)",
    documentKey: "noc",
    description: "No Objection Certificate from developer (for off-plan)",
    category: "Property",
    documentType: "direct_upload",
    isGlobal: true,
    applicableEmploymentTypes: ["Salaried", "Self-Employed", "Both"],
    applicableResidencyStatuses: ["UAE National", "UAE Resident", "Non-Resident", "All"],
    applicableMortgageTypes: ["Islamic", "Conventional", "Both"],
    isMandatory: false,
    requiresFrontBack: false,
    requiresTranslation: false,
    requiresAttestation: false,
    requiresSignature: true,
    requiresStamp: true,
    allowMultipleFiles: false,
    maxFilesAllowed: 1,
    allowedFileTypes: ["pdf"],
    maxFileSizeMB: 5,
    placeholderText: "Upload NOC",
    helperText: "NOC from developer (if applicable)",
    instructions: "Upload NOC from developer",
    displayOrder: 50,
    status: "Active"
  },
  {
    documentName: "Life Insurance Policy",
    documentKey: "life_insurance",
    description: "Life insurance policy (if applicable)",
    category: "Insurance",
    documentType: "direct_upload",
    isGlobal: true,
    applicableEmploymentTypes: ["Salaried", "Self-Employed", "Both"],
    applicableResidencyStatuses: ["UAE National", "UAE Resident", "All"],
    applicableMortgageTypes: ["Islamic", "Conventional", "Both"],
    isMandatory: false,
    requiresFrontBack: false,
    requiresTranslation: false,
    requiresAttestation: false,
    requiresSignature: false,
    requiresStamp: false,
    allowMultipleFiles: false,
    maxFilesAllowed: 1,
    allowedFileTypes: ["pdf"],
    maxFileSizeMB: 5,
    placeholderText: "Upload Life Insurance",
    helperText: "Life insurance policy (if any)",
    instructions: "Upload your life insurance policy",
    displayOrder: 60,
    status: "Active"
  },
  {
    documentName: "Property Insurance",
    documentKey: "property_insurance",
    description: "Property insurance policy",
    category: "Insurance",
    documentType: "direct_upload",
    isGlobal: true,
    applicableEmploymentTypes: ["Salaried", "Self-Employed", "Both"],
    applicableResidencyStatuses: ["UAE National", "UAE Resident", "Non-Resident", "All"],
    applicableMortgageTypes: ["Islamic", "Conventional", "Both"],
    isMandatory: false,
    requiresFrontBack: false,
    requiresTranslation: false,
    requiresAttestation: false,
    requiresSignature: false,
    requiresStamp: false,
    allowMultipleFiles: false,
    maxFilesAllowed: 1,
    allowedFileTypes: ["pdf"],
    maxFileSizeMB: 5,
    placeholderText: "Upload Property Insurance",
    helperText: "Property insurance policy",
    instructions: "Upload property insurance policy",
    displayOrder: 61,
    status: "Active"
  }
];

// Run seed
async function seedGlobalDocuments() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing global documents (optional - comment if you want to keep existing)
    // await DocumentRequirement.deleteMany({ isGlobal: true });
    // console.log('🗑️ Cleared existing global documents');

    // Insert new documents
    let created = 0;
    let skipped = 0;

    for (const doc of globalDocuments) {
      const existing = await DocumentRequirement.findOne({ documentKey: doc.documentKey });
      if (!existing) {
        await DocumentRequirement.create(doc);
        created++;
        console.log(`✅ Created: ${doc.documentName} (${doc.documentKey})`);
      } else {
        skipped++;
        console.log(`⏭️ Skipped (exists): ${doc.documentName} (${doc.documentKey})`);
      }
    }

    console.log('\n========================================');
    console.log(`📊 Seed Summary:`);
    console.log(`   Created: ${created}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total: ${globalDocuments.length}`);
    console.log('========================================');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedGlobalDocuments();
}

module.exports = { globalDocuments };