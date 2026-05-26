import Proposal from '../models/Proposal.js';
import Lead from '../models/VaultLead.js';
import VaultAgent from '../models/Agent.js';
import mongoose from 'mongoose';
import { Role } from '../../../modules/auth/models/role/role.model.js';
import sendEmail from '../../../utils/sendEmail.js';
import puppeteer from 'puppeteer';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../../../config/s3Client.js';
import { buildProposalHTML } from '../utils/proposalPDF.js';
import { emitVaultNotification } from '../services/vaultNotification.service.js';
import { logAudit, actorFromReq } from '../services/auditLog.service.js';

// =============================================================
// HELPER - Generate PDF buffer using puppeteer
// =============================================================
const generatePDFBuffer = async (html) => {
  const browser = await puppeteer.launch({ 
    headless: 'new', 
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({ 
    format: 'A4', 
    printBackground: true, 
    margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' } 
  });
  await browser.close();
  return pdf;
};

// =============================================================
// HELPER - Get user info
// protectMulti populates req.user.role as full object {_id, code, name}
// =============================================================
const getUserInfo = async (req) => {
  let userRole = 'advisor';
  try {
    const role = req.user?.role;
    let code;
    if (role && typeof role === 'object' && role.code != null) {
      code = String(role.code);
    } else if (role) {
      const roleDoc = await Role.findById(role);
      code = roleDoc?.code ? String(roleDoc.code) : null;
    }
    if (code === '18') userRole = 'admin';
    else if (code === '21') userRole = 'partner';
    else userRole = 'advisor';
  } catch { userRole = 'advisor'; }
  return {
    userId: req.user?._id,
    userRole,
    userName: req.user?.fullName || req.user?.companyName || req.user?.email || 'System',
  };
};

// =============================================================
// HELPER - Generate unique proposal reference
// =============================================================
const generateProposalReference = async () => {
  const year = new Date().getFullYear();
  const count = await Proposal.countDocuments();
  const seq = String(count + 1).padStart(4, '0');
  return `PROP-${year}-${seq}`;
};

// =============================================================
// HELPER - Calculations
// =============================================================
const calcEMI = (principal, annualRate, tenureYears) => {
  if (!principal || !annualRate || !tenureYears) return 0;
  const r = annualRate / 100 / 12;
  const n = tenureYears * 12;
  return Math.round(principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
};

const calcLTV = (loanAmount, propertyValue) =>
  propertyValue ? parseFloat(((loanAmount / propertyValue) * 100).toFixed(2)) : 0;

const calcDBR = (emi, existingDebt, income) =>
  income ? parseFloat((((emi + (existingDebt || 0)) / income) * 100).toFixed(2)) : 0;

const getDbrStatus = (dbr, maxDBR = 50) => {
  if (dbr <= maxDBR * 0.85) return 'Eligible';
  if (dbr <= maxDBR) return 'Borderline';
  return 'Ineligible';
};

// =============================================================
// 1. GET ELIGIBLE BANKS FOR LEAD
// =============================================================
export const getEligibleBanksForLead = async (req, res) => {
  try {
    const { leadId } = req.params;
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    const proposalReadyStatuses = ['Qualified', 'Collecting Documents', 'Documents Complete'];
    if (!proposalReadyStatuses.includes(lead.currentStatus))
      return res.status(400).json({ success: false, message: `Lead must be Qualified or in document collection. Current: ${lead.currentStatus}` });

    const BankProduct = mongoose.model('BankMortgageProducts');
    const ci = lead.customerInfo;
    const pd = lead.propertyDetails;
    const lr = lead.loanRequirements;

    const salary = ci.monthlySalary || 0;
    const existingDebt = 0;
    const propValue = pd.propertyValue || 0;
    const downPayment = pd.downPaymentAmount || 0;
    const loanAmount = pd.loanAmountRequired || (propValue - downPayment);
    const tenureYears = lr.preferredTenureYears || 25;
    const ltv = calcLTV(loanAmount, propValue);
    const isUAENat = ci.nationality === 'UAE' || ci.residencyStatus === 'UAE National';
    const maxDBR = isUAENat ? 55 : 50;

    const products = await BankProduct.find({
      status: 'Active',
      isDeleted: false,
      employmentStatus: { $in: [ci.employmentStatus, 'Both'] },
      residencyStatus: { $in: [ci.residencyStatus, 'All'] },
    }).populate('bank', 'bankName bankCode logo');

    const eligible = [];
    const ineligible = [];

    for (const product of products) {
      const bank = product.bank;
      if (!bank) continue;

      const rate = parseFloat(product.minimumFloorRate) || 0;
      const emi = calcEMI(loanAmount, rate, tenureYears);
      const dbr = calcDBR(emi, existingDebt, salary);
      const dbrStat = getDbrStatus(dbr, maxDBR);
      const ltvOk = ltv <= (product.ltv?.max || 85);
      const salOk = salary >= (product.minSalary || 0);
      const dbrOk = dbrStat !== 'Ineligible';
      const isEligible = ltvOk && salOk && dbrOk;

      const item = {
        bankId: bank._id,
        bankName: bank.bankName,
        bankLogo: bank.logo || null,
        productId: product._id,
        productName: product.productName,
        mortgageType: product.mortgageType,
        rate,
        rateType: product.rateType,
        emi,
        ltv,
        maxLTV: product.ltv?.max || 85,
        dbr,
        dbrStatus: dbrStat,
        processingFee: product.bankFees || 0,
        valuationFee: product.propertyValuationFee || 0,
        preApprovalFee: product.bankPreApprovalFee || 0,
        lifeInsurance: product.lifeInsurance || { value: 0, frequency: 'pa' },
        propertyInsurance: product.propertyInsurance || { value: 0, frequency: 'pa' },
        salaryTransferRequired: product.salaryTransfer === 'STL',
        keyFeatures: product.keyFeatures || [],
        isEligible,
        reasons: [
          !ltvOk ? `LTV ${ltv}% exceeds max ${product.ltv?.max}%` : null,
          !salOk ? `Salary AED ${salary} below minimum AED ${product.minSalary}` : null,
          !dbrOk ? `DBR ${dbr}% exceeds max ${maxDBR}%` : null,
        ].filter(Boolean),
      };

      isEligible ? eligible.push(item) : ineligible.push(item);
    }

    eligible.sort((a, b) => a.rate - b.rate);

    return res.status(200).json({
      success: true,
      data: {
        leadId,
        customerSummary: { salary, loanAmount, ltv, tenureYears, maxDBR, nationality: ci.nationality, residency: ci.residencyStatus },
        eligible,
        ineligible,
        summary: { totalEligible: eligible.length, totalIneligible: ineligible.length, bestRate: eligible[0]?.rate || null, lowestEMI: eligible[0]?.emi || null },
      },
    });
  } catch (err) {
    console.error('getEligibleBanksForLead:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =============================================================
// 2. CREATE PROPOSAL
// =============================================================
export const createProposal = async (req, res) => {
  try {
    const { leadId, selectedBanks, coverNote, internalNotes } = req.body;

    if (!leadId) return res.status(400).json({ success: false, message: 'leadId is required' });
    if (!selectedBanks?.length) return res.status(400).json({ success: false, message: 'selectedBanks is required' });
    if (selectedBanks.length > 3) return res.status(400).json({ success: false, message: 'Maximum 3 banks allowed' });

    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    const proposalReadyStatuses = ['Qualified', 'Collecting Documents', 'Documents Complete'];
    if (!proposalReadyStatuses.includes(lead.currentStatus))
      return res.status(400).json({ success: false, message: `Lead must be Qualified or in document collection. Current: ${lead.currentStatus}` });

    const roleObj  = req.user?.role;
    const roleCode2 = typeof roleObj === 'object' ? String(roleObj.code ?? '') : String(roleObj ?? '');
    const isAdmin    = roleCode2 === '18';
    const isPartner  = roleCode2 === '21';
    const isAdvisor  = roleCode2 === '26';
    const isPartnerAffiliatedAgent = roleCode2 === '22' && req.user?.agentType === 'PartnerAffiliatedAgent';

    if (!isAdmin && !isPartner && !isAdvisor && !isPartnerAffiliatedAgent)
      return res.status(403).json({ success: false, message: 'Only Advisor, Partner, or Partner-Affiliated Agent can create proposals' });

    // PartnerAffiliatedAgent can only create proposals for their own leads
    if (isPartnerAffiliatedAgent && lead.sourceInfo?.createdById?.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: 'You can only create proposals for your own leads' });

    const { userRole, userName } = await getUserInfo(req);
    const BankProduct = mongoose.model('BankMortgageProducts');

    const ci = lead.customerInfo;
    const pd = lead.propertyDetails;
    const lr = lead.loanRequirements;

    const salary = ci.monthlySalary || 0;
    const existingDebt = 0;
    const propValue = pd.propertyValue || 0;
    const downPayment = pd.downPaymentAmount || 0;
    const loanAmount = pd.loanAmountRequired || (propValue - downPayment);
    const tenureYears = lr.preferredTenureYears || 25;
    const ltv = calcLTV(loanAmount, propValue);
    const isUAENat = ci.nationality === 'UAE' || ci.residencyStatus === 'UAE National';
    const maxDBR = isUAENat ? 55 : 50;

    const builtBanks = [];
    for (const item of selectedBanks) {
      const product = await BankProduct.findById(item.productId).populate('bank');
      if (!product) return res.status(404).json({ success: false, message: `Bank product ${item.productId} not found` });

      const bank = product.bank;
      const rate = parseFloat(product.minimumFloorRate) || 0;
      const emi = calcEMI(loanAmount, rate, tenureYears);
      const dbr = calcDBR(emi, existingDebt, salary);
      const dbrSt = getDbrStatus(dbr, maxDBR);

      builtBanks.push({
        bankId: bank._id,
        bankName: bank.bankName,
        bankLogo: bank.logo || null,
        productId: product._id,
        productName: product.productName,
        mortgageType: product.mortgageType,
        snapshotRate: rate,
        snapshotRateType: product.rateType,
        snapshotFollowOnRate: product.followOnRate || null,
        snapshotEMI: emi,
        snapshotLTV: ltv,
        maxLTV: product.ltv?.max || 85,
        dbrBreakdown: {
          monthlyEMI: emi,
          existingMonthlyDebt: existingDebt,
          totalMonthlyObligations: emi + existingDebt,
          totalMonthlyIncome: salary,
          dbrPercentage: dbr,
          dbrStatus: dbrSt,
          maxAllowedDBR: maxDBR,
        },
        snapshotProcessingFee: product.bankFees || 0,
        snapshotValuationFee: product.propertyValuationFee || 0,
        snapshotPreApprovalFee: product.bankPreApprovalFee || 0,
        snapshotBuyoutFee: product.buyoutFee || 0,
        isBuyoutFeeNA: product.isBuyoutFeeNA || false,
        lifeInsurance: product.lifeInsurance || { value: 0, frequency: 'pa' },
        propertyInsurance: product.propertyInsurance || { value: 0, frequency: 'pa' },
        isEligible: ltv <= (product.ltv?.max || 85) && dbrSt !== 'Ineligible',
        isRecommended: item.isRecommended || false,
        salaryTransferRequired: product.salaryTransfer === 'STL',
        keyFeatures: product.keyFeatures || [],
      });
    }

    const proposalReference = await generateProposalReference();

    const proposal = await Proposal.create({
      proposalReference,
      leadId,
      customerId: lead.customerId || null,
      createdBy: { role: userRole, userId: req.user._id, userName },
      customerSnapshot: {
        fullName: `${ci.firstName} ${ci.lastName}`.trim(),
        email: ci.email || null,
        mobile: ci.mobileNumber || null,
        nationality: ci.nationality || null,
        residencyStatus: ci.residencyStatus || null,
        employmentStatus: ci.employmentStatus || null,
        monthlySalary: ci.monthlySalary || null,
        totalMonthlyIncome: ci.monthlySalary || null,
        totalMonthlyDebt: existingDebt || null,
        dateOfBirth: ci.dateOfBirth || null,
      },
      propertySnapshot: {
        propertyValue: propValue,
        downPaymentAmount: downPayment,
        loanAmountRequired: loanAmount,
        ltvPercentage: ltv,
        tenureYears,
        propertyType: pd.propertyType || null,
        transactionType: pd.transactionType || null,
        propertyAddress: pd.propertyAddress || {},
      },
      selectedBanks: builtBanks,
      coverNote: coverNote || null,
      internalNotes: internalNotes || null,
      status: 'Draft',
    });

    emitVaultNotification({
      eventType:     'PROPOSAL_CREATED',
      title:         'New Proposal Created',
      message:       `${proposalReference} — created by ${userName} (${userRole})`,
      entityId:      proposal._id,
      entityModel:   'Proposal',
      createdByName: userName,
      createdByRole: userRole,
    });

    await logAudit({
      entityType:    'LEAD',
      entityId:      lead._id,
      entityRef:     proposal.proposalReference,
      action:        'PROPOSAL_CREATED',
      newValue:      { banksCount: selectedBanks.length },
      ...actorFromReq(req, userRole),
      visibleToRoles: ['admin', 'advisor', 'partner', 'partner_affiliated_agent'],
      metadata:      { leadId: leadId.toString(), proposalId: proposal._id.toString() }
    });

    return res.status(201).json({ success: true, message: 'Proposal created successfully', data: proposal });
  } catch (err) {
    console.error('createProposal:', err);
    if (err.name === 'ValidationError') {
      const msgs = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: msgs.join(', ') });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =============================================================
// 3. SEND PROPOSAL PDF TO CUSTOMER EMAIL
// =============================================================
export const sendProposalPDF = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, customerName } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Customer email is required' });
    }

    const proposal = await Proposal.findOne({ _id: id, isDeleted: false });
    if (!proposal) {
      return res.status(404).json({ success: false, message: 'Proposal not found' });
    }

    const lead = await Lead.findById(proposal.leadId);
    const name = customerName || lead?.customerInfo?.firstName || 'Customer';

    // Generate PDF from HTML
    const html = buildProposalHTML(proposal);
    const pdfBuffer = await generatePDFBuffer(html);
    const filename = `Xoto-Proposal-${proposal.proposalReference}.pdf`;
    const s3Key = `proposals/${proposal._id}/${filename}`;

    // Upload PDF to S3
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: s3Key,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
      })
    );

    const pdfUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
    proposal.pdf.pdfGeneratedAt = new Date();

    // Send email with PDF attachment
    await sendEmail({
      to: email,
      subject: `Your Mortgage Proposal — ${proposal.proposalReference}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #5C039B, #03A4F4); padding: 30px; color: white; text-align: center; border-radius: 12px 12px 0 0;">
            <h2 style="margin: 0;">🏠 Your Mortgage Proposal</h2>
            <p style="margin: 8px 0 0; opacity: 0.9;">Reference: ${proposal.proposalReference}</p>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px; color: #1f2937;">Dear ${name},</p>
            <p>Thank you for choosing <strong>Xoto VAULT</strong>. Please find your personalized mortgage proposal attached to this email as a PDF document.</p>
            <p>The proposal compares <strong>${proposal.selectedBanks.length} bank option(s)</strong> and includes:</p>
            <ul>
              <li>Monthly EMI calculations</li>
              <li>DBR (Debt-to-Burden Ratio) analysis</li>
              <li>LTV (Loan-to-Value) breakdown</li>
              <li>Complete fee structure</li>
              <li>Bank comparison and recommendations</li>
            </ul>
            ${proposal.coverNote ? `
              <div style="background: #faf5ff; border-left: 4px solid #5C039B; padding: 14px 18px; margin: 20px 0; border-radius: 8px;">
                <strong style="color: #5C039B;">📝 Note from your advisor:</strong>
                <p style="margin: 8px 0 0; color: #374151;">${proposal.coverNote}</p>
              </div>
            ` : ''}
            <p style="margin-top: 24px;"><strong>Next Steps:</strong></p>
            <ol>
              <li>Review the attached PDF proposal</li>
              <li>Compare the bank options</li>
              <li>Contact your advisor with your preferred bank choice</li>
            </ol>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
            <p style="font-size: 12px; color: #94a3b8;">
              <strong>Important:</strong> This proposal is indicative only. Final rates and approvals are subject to bank discretion.<br>
              Valid until ${proposal.validUntil ? new Date(proposal.validUntil).toDateString() : '30 days from issue'}.
            </p>
            <p style="font-size: 12px; color: #94a3b8;">Prepared by ${proposal.createdBy?.userName} · Xoto VAULT</p>
          </div>
        </div>
      `,
      attachments: [{
        filename: filename,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }],
    });

    const { userId, userRole, userName } = await getUserInfo(req);
    await proposal.markAsSent(email, pdfUrl, { userId, userName });

    await logAudit({
      entityType:    'LEAD',
      entityId:      proposal.leadId,
      entityRef:     proposal.proposalReference,
      action:        'PROPOSAL_PDF_SENT',
      newValue:      { email, pdfUrl },
      ...actorFromReq(req, userRole),
      visibleToRoles: ['admin', 'advisor', 'partner', 'partner_affiliated_agent'],
      metadata:      { proposalId: proposal._id.toString() }
    });

    return res.status(200).json({
      success: true,
      message: `Proposal PDF sent to ${email}`,
      data: {
        proposalReference: proposal.proposalReference,
        sentTo: email,
        sentAt: proposal.pdf.sentAt,
        status: proposal.status,
      },
    });
  } catch (err) {
    console.error('sendProposalPDF:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =============================================================
// 4. RECORD CUSTOMER PREFERENCE
// =============================================================
export const recordCustomerPreference = async (req, res) => {
  try {
    const { id } = req.params;
    const { bankId, bankName, productId, feedbackNote } = req.body;

    if (!bankId || !bankName) {
      return res.status(400).json({ success: false, message: 'bankId and bankName are required' });
    }

    const proposal = await Proposal.findOne({ _id: id, isDeleted: false });
    if (!proposal) {
      return res.status(404).json({ success: false, message: 'Proposal not found' });
    }

    if (!['Sent', 'Draft'].includes(proposal.status)) {
      return res.status(400).json({ success: false, message: `Cannot record preference for ${proposal.status} proposal` });
    }

    const { userId, userRole, userName } = await getUserInfo(req);
    await proposal.recordCustomerPreference(bankId, bankName, productId, feedbackNote, { userId, userName });

    await logAudit({
      entityType:    'LEAD',
      entityId:      proposal.leadId,
      entityRef:     proposal.proposalReference,
      action:        'CUSTOMER_PREFERENCE_RECORDED',
      newValue:      { bankId, bankName, feedbackNote },
      ...actorFromReq(req, userRole),
      visibleToRoles: ['admin', 'advisor', 'partner', 'partner_affiliated_agent'],
      metadata:      { proposalId: proposal._id.toString() }
    });

    return res.status(200).json({
      success: true,
      message: 'Customer preference recorded',
      data: {
        proposalReference: proposal.proposalReference,
        status: proposal.status,
        preferredBank: proposal.customerPreference.preferredBankName,
        recordedAt: proposal.customerPreference.recordedAt,
      },
    });
  } catch (err) {
    console.error('recordCustomerPreference:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =============================================================
// 5. REJECT PROPOSAL
// =============================================================
export const rejectProposal = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const proposal = await Proposal.findOne({ _id: id, isDeleted: false });
    if (!proposal) {
      return res.status(404).json({ success: false, message: 'Proposal not found' });
    }

    proposal.status = 'Rejected';
    if (reason) {
      proposal.internalNotes = (proposal.internalNotes || '') + `\nRejected: ${reason}`;
    }
    await proposal.save();

    return res.status(200).json({ success: true, message: 'Proposal marked as rejected', data: proposal });
  } catch (err) {
    console.error('rejectProposal:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =============================================================
// 6. GET MY PROPOSALS
// =============================================================
export const getMyProposals = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    const roleObj2  = req.user?.role;
    const roleCode3 = typeof roleObj2 === 'object' ? String(roleObj2.code ?? '') : String(roleObj2 ?? '');
    const isAdmin   = roleCode3 === '18';
    const isPartner = roleCode3 === '21';

    const query = { isDeleted: false };

    if (isAdmin) {
      // Admin sees all proposals
    } else if (isPartner) {
      // Partner sees their own proposals + affiliated agents' proposals
      const affiliatedAgents = await VaultAgent.find(
        { partnerId: req.user._id, agentType: 'PartnerAffiliatedAgent', isDeleted: false },
        '_id'
      );
      const agentIds = affiliatedAgents.map(a => a._id);
      query['createdBy.userId'] = { $in: [req.user._id, ...agentIds] };
    } else {
      // Advisor / PartnerAffiliatedAgent / others see only their own
      query['createdBy.userId'] = req.user._id;
    }

    if (status) query.status = status;

    const [proposals, total] = await Promise.all([
      Proposal.find(query)
        .populate('leadId', 'customerInfo.firstName customerInfo.lastName customerInfo.mobileNumber currentStatus')
        .sort({ createdAt: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit)),
      Proposal.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: proposals,
      total,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit),
      },
    });
  } catch (err) {
    console.error('getMyProposals:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =============================================================
// 7. GET PROPOSAL BY ID
// =============================================================
export const getProposalById = async (req, res) => {
  try {
    const proposal = await Proposal.findOne({ _id: req.params.id, isDeleted: false })
      .populate('leadId')
      .populate('selectedBanks.bankId', 'bankName bankCode logo');

    if (!proposal) {
      return res.status(404).json({ success: false, message: 'Proposal not found' });
    }
    return res.status(200).json({ success: true, data: proposal });
  } catch (err) {
    console.error('getProposalById:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =============================================================
// 8. GET PROPOSALS BY LEAD
// =============================================================
export const getProposalsByLead = async (req, res) => {
  try {
    const proposals = await Proposal.find({
      leadId: req.params.leadId,
      isDeleted: false,
    }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: proposals });
  } catch (err) {
    console.error('getProposalsByLead:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =============================================================
// 9. UPDATE PROPOSAL (Draft only)
// =============================================================
export const updateProposal = async (req, res) => {
  try {
    const proposal = await Proposal.findOne({ _id: req.params.id, isDeleted: false });
    if (!proposal) {
      return res.status(404).json({ success: false, message: 'Proposal not found' });
    }
    if (proposal.status !== 'Draft') {
      return res.status(400).json({ success: false, message: 'Only Draft proposals can be updated' });
    }

    const allowed = ['coverNote', 'internalNotes', 'selectedBanks'];
    const updates = {};
    allowed.forEach(f => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });

    const updated = await Proposal.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true });
    return res.status(200).json({ success: true, message: 'Proposal updated', data: updated });
  } catch (err) {
    console.error('updateProposal:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =============================================================
// 10. DELETE PROPOSAL (soft)
// =============================================================
export const deleteProposal = async (req, res) => {
  try {
    const proposal = await Proposal.findOne({ _id: req.params.id, isDeleted: false });
    if (!proposal) {
      return res.status(404).json({ success: false, message: 'Proposal not found' });
    }
    await proposal.softDelete();
    return res.status(200).json({ success: true, message: 'Proposal deleted' });
  } catch (err) {
    console.error('deleteProposal:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};