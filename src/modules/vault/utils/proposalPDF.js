// utils/proposalPDF.js

export const buildProposalHTML = (proposal) => {
  const ps = proposal.propertySnapshot || {};
  const cs = proposal.customerSnapshot || {};
  const bc = proposal.bankComparison || {};
  const banks = proposal.selectedBanks || [];

  const sanitizeText = (value) => {
    if (value == null) return '';
    return String(value).trim().replace(/\s+/g, ' ');
  };

  const fmtAED = (v) => (v != null && v !== 0 ? `AED ${Number(v).toLocaleString()}` : '—');
  const fmtPct = (v) => (v != null && v !== 0 ? `${Number(v).toFixed(2)}%` : '—');

  const dbrColor = (s) => (s === 'Eligible' ? '#059669' : s === 'Borderline' ? '#d97706' : '#dc2626');

  const customerName = sanitizeText(cs.fullName) || 'Customer';
  const nationality = sanitizeText(cs.nationality);
  const residencyStatus = sanitizeText(cs.residencyStatus);
  const employmentStatus = sanitizeText(cs.employmentStatus);
  const transactionType = sanitizeText(ps.transactionType);
  const propertyAddress = [sanitizeText(ps.propertyAddress?.area), sanitizeText(ps.propertyAddress?.city)]
    .filter(Boolean)
    .join(', ');
  const advisorNote = sanitizeText(proposal.coverNote);
  const createdByName = sanitizeText(proposal.createdBy?.userName) || 'Xoto Advisor';

  const bankCardsHTML = banks
    .map((bank) => {
      const bankName = sanitizeText(bank.bankName);
      const productName = sanitizeText(bank.productName);
      const db = bank.dbrBreakdown || {};
      const isRecommended = bank.isRecommended;
      const totalFees = (bank.snapshotProcessingFee || 0) + (bank.snapshotValuationFee || 0) + (bank.snapshotPreApprovalFee || 0);
      const keyFeatures = Array.isArray(bank.keyFeatures)
        ? bank.keyFeatures.map((feature) => sanitizeText(feature)).filter(Boolean)
        : [];

      return `
      <div style="
        border: 2px solid ${isRecommended ? '#10b981' : '#e5e7eb'};
        border-radius: 16px;
        background: ${isRecommended ? '#f0fdf4' : '#ffffff'};
        padding: 20px;
        margin-bottom: 20px;
        page-break-inside: avoid;
      ">
        ${isRecommended ? `
          <div style="
            background: #10b981;
            color: white;
            font-size: 12px;
            font-weight: bold;
            padding: 4px 12px;
            border-radius: 20px;
            display: inline-block;
            margin-bottom: 12px;
          ">
            ⭐ RECOMMENDED
          </div>
        ` : ''}

        <div style="font-size: 20px; font-weight: bold; color: #1f2937;">${bankName || 'Bank Option'}</div>
        <div style="font-size: 12px; color: #6b7280; margin-bottom: 16px;">${productName || 'Mortgage Product'}</div>

        <div style="font-size: 32px; font-weight: bold; color: #7c3aed; margin-bottom: 8px;">${fmtPct(bank.snapshotRate)}</div>
        <div style="font-size: 12px; color: #6b7280; margin-bottom: 20px;">${sanitizeText(bank.snapshotRateType) || 'Fixed'} Rate p.a.</div>

        <div style="background: #f3f4f6; border-radius: 12px; padding: 12px; margin-bottom: 16px;">
          <div style="font-size: 12px; color: #6b7280;">Monthly EMI</div>
          <div style="font-size: 24px; font-weight: bold; color: #1f2937;">${fmtAED(bank.snapshotEMI)}</div>
        </div>

        <table style="width: 100%; font-size: 12px; margin-bottom: 16px;">
          <tr><td style="padding: 6px 0; color: #6b7280;">Loan Amount</td><td style="text-align: right; font-weight: 600;">${fmtAED(ps.loanAmountRequired)}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">LTV Ratio</td><td style="text-align: right; font-weight: 600;">${fmtPct(bank.snapshotLTV)} (Max ${fmtPct(bank.maxLTV)})</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Tenure</td><td style="text-align: right; font-weight: 600;">${ps.tenureYears || 25} years</td></tr>
        </table>

        <div style="font-size: 11px; font-weight: bold; color: #7c3aed; margin: 16px 0 8px;">DBR CALCULATION</div>
        <table style="width: 100%; font-size: 12px; margin-bottom: 16px;">
          <tr><td style="padding: 4px 0; color: #6b7280;">Monthly Income</td><td style="text-align: right;">${fmtAED(db.totalMonthlyIncome)}</td></tr>
          <tr><td style="padding: 4px 0; color: #6b7280;">New EMI</td><td style="text-align: right;">${fmtAED(db.monthlyEMI)}</td></tr>
          <tr><td style="padding: 4px 0; color: #6b7280;">Existing Debt</td><td style="text-align: right;">${fmtAED(db.existingMonthlyDebt)}</td></tr>
          <tr><td style="padding: 4px 0; color: #6b7280;">Total Obligations</td><td style="text-align: right; font-weight: 600;">${fmtAED(db.totalMonthlyObligations)}</td></tr>
          <tr style="color: ${dbrColor(db.dbrStatus)};">
            <td style="padding: 8px 0 4px; font-weight: bold;">DBR Percentage</td>
            <td style="text-align: right; padding: 8px 0 4px;">
              <span style="font-weight: bold;">${fmtPct(db.dbrPercentage)}</span>
              <span style="background: ${dbrColor(db.dbrStatus)}; color: white; font-size: 10px; padding: 2px 8px; border-radius: 20px; margin-left: 6px;">${sanitizeText(db.dbrStatus) || '—'}</span>
            </td>
          </tr>
        </table>

        <div style="font-size: 11px; font-weight: bold; color: #7c3aed; margin: 16px 0 8px;">FEES</div>
        <table style="width: 100%; font-size: 12px; margin-bottom: 16px;">
          <tr><td style="padding: 4px 0; color: #6b7280;">Processing Fee</td><td style="text-align: right;">${fmtAED(bank.snapshotProcessingFee)}</td></tr>
          <tr><td style="padding: 4px 0; color: #6b7280;">Valuation Fee</td><td style="text-align: right;">${fmtAED(bank.snapshotValuationFee)}</td></tr>
          ${bank.snapshotPreApprovalFee ? `<tr><td style="padding: 4px 0; color: #6b7280;">Pre-Approval Fee</td><td style="text-align: right;">${fmtAED(bank.snapshotPreApprovalFee)}</td></tr>` : ''}
          <tr style="border-top: 1px solid #e5e7eb;"><td style="padding: 8px 0 0; font-weight: bold;">Total Upfront Fees</td><td style="text-align: right; padding: 8px 0 0; font-weight: bold;">${fmtAED(totalFees)}</td></tr>
        </table>

        ${keyFeatures.length ? `
          <div style="font-size: 11px; font-weight: bold; color: #7c3aed; margin: 16px 0 8px;">KEY FEATURES</div>
          ${keyFeatures.map((feature) => `<div style="font-size: 11px; color: #059669; padding: 3px 0;">✓ ${feature}</div>`).join('')}
        ` : ''}
      </div>
    `;
    })
    .join('');

  const comparisonBoxes = [
    { label: 'Best Rate', value: bc.bestRateBank ? `${sanitizeText(bc.bestRateBank)} · ${fmtPct(bc.bestRate)}` : '—' },
    { label: 'Lowest EMI', value: bc.lowestEMIBank ? `${sanitizeText(bc.lowestEMIBank)} · ${fmtAED(bc.lowestEMI)}` : '—' },
    { label: 'Lowest Fees', value: sanitizeText(bc.lowestFeesBank) || '—' },
    { label: 'Recommended', value: sanitizeText(bc.recommendedBank) || '—' },
  ];

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Mortgage Proposal ${sanitizeText(proposal.proposalReference)}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #1f2937;
      background: white;
      position: relative;
    }
    * { box-sizing: border-box; }
    @media print {
      body { margin: 0; padding: 0; }
    }
  </style>
</head>
<body>
  <div style="background: linear-gradient(135deg, #5C039B 0%, #03A4F4 100%); padding: 20px 40px; color: white;">
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <img src="https://xotostaging.s3.me-central-1.amazonaws.com/properties/1779698003970-vault-logo.png" alt="Xoto Vault" style="height:44px; width:auto; display:block;" />
        <div style="display:none;">
          <div style="font-size: 14px; font-weight: 700; margin-bottom: 2px;">Mortgage Proposal</div>
        </div>
      </div>
      <div style="text-align: right;">
        <div style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.4); border-radius: 20px; padding: 6px 18px; font-size: 13px; font-weight: bold; display: inline-block;">
          ${sanitizeText(proposal.proposalReference)}
        </div>
        <div style="font-size: 11px; opacity: 0.7; margin-top: 8px;">${new Date(proposal.createdAt || Date.now()).toDateString()}</div>
      </div>
    </div>
  </div>

  <div style="position: relative; z-index: 1;">
    <div class="watermark" style="position: fixed; top: 45%; left: 50%; transform: translate(-50%, -50%) rotate(-40deg); font-size: 72px; font-weight: 900; color: rgba(20,20,20,0.08); letter-spacing: 14px; white-space: nowrap; z-index: 0; pointer-events: none;">Xoto VAULT</div>

    <div style="background: #f8fafc; border-bottom: 1px solid #e5e7eb; padding: 20px 40px;">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; align-items: start;">
        <div>
          <div style="font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">Prepared For</div>
          <div style="font-size: 16px; font-weight: bold; color: #1f2937;">${customerName}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 4px;">${nationality}${nationality && residencyStatus ? ' · ' : ''}${residencyStatus}${(nationality || residencyStatus) && employmentStatus ? ' · ' : ''}${employmentStatus}</div>
        </div>
        <div>
          <div style="font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">Property Value</div>
          <div style="font-size: 16px; font-weight: bold; color: #1f2937;">${fmtAED(ps.propertyValue)}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 4px;">${transactionType || '—'}</div>
        </div>
        <div>
          <div style="font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">Loan Required</div>
          <div style="font-size: 16px; font-weight: bold; color: #1f2937;">${fmtAED(ps.loanAmountRequired)}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Down Payment: ${fmtAED(ps.downPaymentAmount)}</div>
        </div>
        <div>
          <div style="font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">LTV / Tenure</div>
          <div style="font-size: 16px; font-weight: bold; color: #1f2937;">${fmtPct(ps.ltvPercentage)}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 4px;">${ps.tenureYears || 25} years</div>
        </div>
        ${cs.monthlySalary ? `
        <div>
          <div style="font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">Monthly Salary</div>
          <div style="font-size: 16px; font-weight: bold; color: #1f2937;">${fmtAED(cs.monthlySalary)}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Total monthly income</div>
        </div>
        ` : ''}
      </div>
    </div>

    <div style="padding: 30px 40px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 28px;">
        <div style="flex: 1; min-width: 280px;">
          ${advisorNote ? `
            <div style="background: #faf5ff; border-left: 4px solid #5C039B; border-radius: 8px; padding: 14px 18px; margin-bottom: 16px; line-height: 1.6;">
              <div style="font-weight: bold; color: #5C039B; margin-bottom: 6px;">📝 Note from your advisor</div>
              <div style="font-size: 13px; color: #374151;">${advisorNote}</div>
            </div>
          ` : ''}
          <div style="font-size: 14px; color: #475569; line-height: 1.8;">
            This proposal has been generated with your selected bank options and financial snapshot. It is designed for clarity and to help you compare your best mortgage choices side by side.
          </div>
        </div>
        <div style="max-width: 220px; text-align: right;">
          <img src="https://xotostaging.s3.me-central-1.amazonaws.com/properties/1779698003970-vault-logo.png" alt="Xoto Vault" style="max-width: 160px; height: auto; display: block; margin: 0 auto 8px;" />
          <div style="font-size: 11px; color: #94a3b8;">Professional mortgage proposal</div>
        </div>
      </div>

      <div style="margin-bottom: 28px;">
        <div style="font-size: 16px; font-weight: bold; color: #5C039B; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #e9d5ff;">
          📊 Comparison Summary
        </div>
        <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px;">
          ${comparisonBoxes
            .map(
              (box) => `
            <div style="background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 12px; padding: 14px; min-height: 80px;">
              <div style="font-size: 10px; font-weight: bold; color: #7c3aed; text-transform: uppercase; margin-bottom: 6px;">${box.label}</div>
              <div style="font-size: 13px; font-weight: bold; color: #1f2937;">${box.value}</div>
            </div>
          `,
            )
            .join('')}
        </div>
      </div>

      <div style="margin-bottom: 28px;">
        <div style="font-size: 16px; font-weight: bold; color: #5C039B; margin-bottom: 20px; padding-bottom: 8px; border-bottom: 2px solid #e9d5ff;">
          🏦 Bank Options (${banks.length})
        </div>
        <div style="display: grid; grid-template-columns: repeat(${Math.min(banks.length, 3)}, minmax(0, 1fr)); gap: 20px;">
          ${bankCardsHTML}
        </div>
      </div>

    //   <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px 18px; margin-top: 20px; font-size: 11px; color: #1e40af; line-height: 1.6;">
    //     <div><strong>EMI Formula:</strong> P × r × (1+r)ⁿ / ((1+r)ⁿ − 1) · P = Loan Amount · r = Monthly Interest Rate · n = Total Months</div>
    //     <div style="margin-top: 6px;"><strong>DBR Calculation:</strong> (Total Monthly Obligations ÷ Total Monthly Income) × 100 · Max DBR = ${residencyStatus === 'UAE National' ? '55' : '50'}% for your profile</div>
    //   </div>
    </div>

    <div style="background: #f8fafc; border-top: 1px solid #e5e7eb; padding: 16px 40px; font-size: 10px; color: #94a3b8; line-height: 1.5;">
      <strong style="color: #64748b;">Important:</strong> This proposal is indicative only. All rates, EMI, fees and calculations are estimates.
      Final approval, rates and terms are subject to bank credit assessment and policies.
      <br>
      <strong style="color: #64748b;">Valid Until:</strong> ${proposal.validUntil ? new Date(proposal.validUntil).toDateString() : '30 days from issue'}
      · Prepared by ${createdByName} · Xoto VAULT Mortgage Services
    </div>
  </div>
</body>
</html>`;
};
