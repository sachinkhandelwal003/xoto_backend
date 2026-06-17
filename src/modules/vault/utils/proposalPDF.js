// utils/proposalPDF.js

export const buildProposalHTML = (proposal) => {
  const ps  = proposal.propertySnapshot  || {};
  const cs  = proposal.customerSnapshot  || {};
  const banks = proposal.selectedBanks   || [];

  /* ── helpers ── */
  const san   = (v) => (v == null ? '' : String(v).trim());
  const fmtN  = (v, dec = 0) => (v != null && v !== '' ? Number(v).toLocaleString('en-AE', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '0');
  const aed   = (v, dec = 0) => `AED ${fmtN(v, dec)}`;
  const pct   = (v, dec = 2) => (v != null && v !== '' ? `${Number(v).toFixed(dec)}%` : '—');
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  /* ── proposal-level data ── */
  const customerName  = san(cs.fullName)  || 'Customer';
  const advisorName   = san(proposal.createdBy?.userName || proposal.createdBy?.name) || 'Advisor';
  const createdDate   = fmtDate(proposal.createdAt) || fmtDate(new Date());
  const mortgageType  = san(proposal.mortgageType) || 'Best possible rate';

  /* ── property snapshot ── */
  const employmentStatus = san(cs.employmentStatus) || '—';
  const residencyStatus  = san(cs.residencyStatus)  || '—';
  const transactionType  = san(ps.transactionType)  || '—';
  const tenureYears      = ps.tenureYears            || 25;
  const location         = san(ps.location || ps.propertyAddress?.city || ps.propertyAddress?.emirate) || '—';

  const propertyValue   = Number(ps.propertyValue   || 0);
  const equityRelease   = Number(ps.equityReleaseAmount || 0);
  const downPayment     = Number(ps.downPaymentAmount   || 0);
  const ltv             = ps.ltvPercentage != null ? ps.ltvPercentage
                          : (propertyValue ? ((Number(ps.loanAmountRequired) / propertyValue) * 100).toFixed(0) : 0);
  const feeFinancing    = ps.feeFinancing ? 'Yes' : 'No';
  const outstandingLoan = Number(ps.outstandingLoanAmount         || 0);
  const realEstateFee   = Number(ps.realEstateFeeFinanced         || ps.realEstateFee   || 0);
  const landDeptFee     = Number(ps.landDepartmentFeeFinanced     || ps.landDepartmentFee || 0);
  const totalLoan       = Number(ps.loanAmountRequired            || 0);

  /* ── fee constants (standard UAE) ── */
  const mortgageRegFee   = Math.round(totalLoan * 0.0025) + 290;
  const mortgageRelFee   = 1290;
  const transferCtrFee   = 4515;

  /* ── per-bank row builder ── */
  const bRow = (label, fn, labelCss = '', cellCss = '') => `
    <tr>
      <td style="background:#fafafa;font-size:10px;color:#555;${labelCss}">${label}</td>
      ${banks.map(b => `<td style="text-align:center;vertical-align:middle;${cellCss}">${fn(b)}</td>`).join('')}
    </tr>`;

  const subHdr = (label) => `
    <tr>
      <td colspan="${banks.length + 1}"
          style="background:#ececec;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.4px;padding:6px 10px;border-color:#ccc;">
        ${label}
      </td>
    </tr>`;

  /* ── bank header cells ── */
  const bankHeaderCells = banks.map(b => `
    <td style="text-align:center;vertical-align:middle;background:#fafafa;padding:10px 8px;border-color:#ccc;">
      ${b.bankLogo
        ? `<img src="${san(b.bankLogo)}" style="max-height:40px;max-width:120px;display:block;margin:0 auto 6px;" />`
        : ''}
      <div style="font-weight:700;font-size:12px;">${san(b.bankName)}</div>
      ${b.productName ? `<div style="font-size:10px;color:#777;">${san(b.productName)}</div>` : ''}
    </td>`).join('');

  /* ── fee totals per bank ── */
  const bankFeeTotal = (b) =>
    mortgageRegFee + mortgageRelFee + transferCtrFee
    + Number(b.snapshotProcessingFee || 0)
    + Number(b.snapshotValuationFee  || 0)
    + Number(b.brokerFee             || 0);

  const bankGrandTotal = (b) => bankFeeTotal(b) + downPayment;

  /* ══════════════════════════════════════════════════════════════ */
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Mortgage Proposal - ${customerName}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;font-size:11px;background:#fff;line-height:1.45;}
    .page{max-width:960px;margin:0 auto;padding:28px 32px;}

    /* ── header ── */
    .ph{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;}
    .ph h1{font-size:26px;font-weight:900;color:#1a1a1a;}
    .ph .co{font-size:18px;font-weight:900;color:#1a1a1a;text-align:right;}
    .sub{font-size:12px;color:#444;margin-bottom:2px;}
    .dt{font-size:11px;color:#777;margin-bottom:22px;}

    /* ── section headers ── */
    .sh{background:#1a1a1a;color:#fff;padding:7px 12px;font-size:11px;font-weight:700;margin-bottom:0;}
    .sh-row{display:flex;align-items:center;justify-content:space-between;}
    .sh-note{font-size:10px;font-weight:400;font-style:italic;color:#bbb;}

    /* ── tables ── */
    table{width:100%;border-collapse:collapse;margin-bottom:18px;}
    td,th{border:1px solid #ccc;padding:7px 10px;vertical-align:top;font-size:11px;}

    /* ── offer detail cells ── */
    .rate-big{font-size:14px;font-weight:800;}
    .rate-sm{font-size:10px;color:#555;}
    .emi-big{font-size:15px;font-weight:800;}
    .ins-bold{font-weight:700;}
    .ins-sm{font-size:10px;color:#555;}

    /* ── disclaimer / important ── */
    .disc{border:1px solid #ccc;padding:8px 14px;margin-bottom:8px;font-size:10px;color:#333;}
    .imp{padding:8px 0;font-size:10px;color:#333;margin-bottom:20px;}

    /* ── required docs ── */
    .dl{padding:10px 16px;border:1px solid #ccc;}
    .dl-t{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin:14px 0 4px;}
    .dl-t:first-child{margin-top:0;}
    .dl-i{font-size:11px;color:#333;padding:2px 0;}
    .dl-i::before{content:"✓  ";font-size:10px;}

    @media print{
      body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      .sh{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    }
  </style>
</head>
<body>
<div class="page">

  <!-- ── PAGE HEADER ── -->
  <div class="ph">
    <h1>Mortgage Proposal</h1>
    <div class="co">XOTO PROPTECH REAL ESTATE L.L.C</div>
  </div>
  <div class="sub">Prepared for <strong>${customerName}</strong> by <strong>${advisorName}</strong></div>
  <div class="dt">${createdDate}</div>

  <!-- ── FINANCIAL REQUIREMENTS ── -->
  <div class="sh">Financial requirements</div>
  <table style="margin-bottom:18px;">
    <tr>
      <td style="width:16.66%;border-color:#ccc;">
        <div style="font-size:10px;color:#777;margin-bottom:2px;">Employment status</div>
        <div style="font-weight:600;">${employmentStatus}</div>
      </td>
      <td style="width:16.66%;border-color:#ccc;">
        <div style="font-size:10px;color:#777;margin-bottom:2px;">Mortgage type</div>
        <div style="font-weight:600;">${mortgageType}</div>
      </td>
      <td style="width:16.66%;border-color:#ccc;">
        <div style="font-size:10px;color:#777;margin-bottom:2px;">Residency status</div>
        <div style="font-weight:600;">${residencyStatus}</div>
      </td>
      <td style="width:16.66%;border-color:#ccc;">
        <div style="font-size:10px;color:#777;margin-bottom:2px;">Transaction type</div>
        <div style="font-weight:600;">${transactionType}</div>
      </td>
      <td style="width:16.66%;border-color:#ccc;">
        <div style="font-size:10px;color:#777;margin-bottom:2px;">Mortgage length</div>
        <div style="font-weight:600;">${tenureYears} years</div>
      </td>
      <td style="width:16.66%;border-color:#ccc;">
        <div style="font-size:10px;color:#777;margin-bottom:2px;">Location</div>
        <div style="font-weight:600;">${location}</div>
      </td>
    </tr>
  </table>

  <!-- ── LOAN AMOUNT ── -->
  <div class="sh">Loan amount</div>
  <table style="margin-bottom:18px;">
    <tr>
      <!-- left: 4-cell summary -->
      <td style="width:55%;border-right:2px solid #aaa;padding:0;">
        <table style="border:none;margin-bottom:0;width:100%;">
          <tr>
            <td style="border:none;padding:10px 12px;width:25%;text-align:center;">
              <div style="font-size:10px;color:#777;margin-bottom:4px;">Property value</div>
              <div style="font-size:13px;font-weight:700;">${aed(propertyValue)}</div>
            </td>
            <td style="border:none;padding:10px 12px;width:25%;text-align:center;border-left:1px solid #e0e0e0;">
              ${equityRelease > 0
                ? `<div style="font-size:10px;color:#777;margin-bottom:4px;">Equity release amount</div>
                   <div style="font-size:13px;font-weight:700;">${aed(equityRelease)}</div>`
                : `<div style="font-size:10px;color:#777;margin-bottom:4px;">Down payment</div>
                   <div style="font-size:13px;font-weight:700;">${aed(downPayment)}</div>`}
            </td>
            <td style="border:none;padding:10px 12px;width:25%;text-align:center;border-left:1px solid #e0e0e0;">
              <div style="font-size:10px;color:#777;margin-bottom:4px;">Loan to value (LTV/FTV)</div>
              <div style="font-size:13px;font-weight:700;">${pct(ltv, 0)}</div>
            </td>
            <td style="border:none;padding:10px 12px;width:25%;text-align:center;border-left:1px solid #e0e0e0;">
              <div style="font-size:10px;color:#777;margin-bottom:4px;">Fee financing</div>
              <div style="font-size:13px;font-weight:700;">${feeFinancing}</div>
            </td>
          </tr>
        </table>
      </td>
      <!-- right: stacked totals -->
      <td style="width:45%;padding:0;vertical-align:top;">
        <table style="border:none;margin-bottom:0;width:100%;">
          <tr>
            <td style="border:none;border-bottom:1px solid #eee;padding:6px 10px;color:#555;">Outstanding Loan Amount</td>
            <td style="border:none;border-bottom:1px solid #eee;padding:6px 10px;text-align:right;font-weight:600;">${aed(outstandingLoan)}</td>
          </tr>
          <tr>
            <td style="border:none;border-bottom:1px solid #eee;padding:6px 10px;color:#555;">Real estate fee financed amount</td>
            <td style="border:none;border-bottom:1px solid #eee;padding:6px 10px;text-align:right;font-weight:600;">${aed(realEstateFee)}</td>
          </tr>
          <tr>
            <td style="border:none;border-bottom:1px solid #eee;padding:6px 10px;color:#555;">Land department fee financed amount</td>
            <td style="border:none;border-bottom:1px solid #eee;padding:6px 10px;text-align:right;font-weight:600;">${aed(landDeptFee)}</td>
          </tr>
          <tr>
            <td style="border:none;padding:7px 10px;font-weight:700;">Total loan amount</td>
            <td style="border:none;padding:7px 10px;text-align:right;font-weight:800;font-size:13px;">${aed(totalLoan)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- ── OFFER DETAILS ── -->
  <div class="sh">
    <div class="sh-row">
      <span>Offer details</span>
      <span class="sh-note">These figures are for illustrative purposes only and may differ at the final offer stage.</span>
    </div>
  </div>
  <table style="margin-bottom:18px;">
    <thead>
      <tr>
        <td style="width:200px;background:#fafafa;border-color:#ccc;"></td>
        ${bankHeaderCells}
      </tr>
    </thead>
    <tbody>
      ${bRow('Monthly mortgage payment',
        b => `<span class="emi-big">${b.snapshotEMI ? aed(b.snapshotEMI, 2) : '—'}</span>`
      )}
      ${bRow('Rate terms',
        b => {
          const r  = b.snapshotRate   != null ? `${Number(b.snapshotRate).toFixed(2)}%`    : '—';
          const yrs = b.ratePeriodYears || b.fixedPeriodYears;
          const rt = san(b.snapshotRateType) || 'Fixed';
          return `<div class="rate-big">${r}</div>
                  <div class="rate-sm">${rt}${yrs ? ` for ${yrs} year${yrs > 1 ? 's' : ''}` : ''}</div>`;
        }
      )}
      ${bRow('Follow on rate',
        b => {
          const rateVal = b.snapshotFollowOnRate || b.followOnRate;
          if (rateVal == null) return '—';
          const rateStr = String(rateVal);
          const isNum = !isNaN(parseFloat(rateStr)) && isFinite(rateStr);
          const displayVal = isNum ? `${Number(rateStr).toFixed(2)}%` : rateStr;
          const t = san(b.followOnRateType || b.eiborType || '');
          return `<div class="rate-big">${displayVal}</div>${t ? `<div class="rate-sm">${t}</div>` : ''}`;
        }
      )}
      ${bRow('Minimum Floor Rate',
        b => b.minimumFloorRate != null ? pct(b.minimumFloorRate) : '—'
      )}
      ${bRow('Property Insurance',
        b => {
          if (!b.propertyInsurance) return '—';
          const pi  = b.propertyInsurance;
          const val = pi.value ? aed(pi.value) : '';
          const pct2 = pi.percentage
            ? `(${Number(pi.percentage).toFixed(4)}% per annum of the property value to be paid annually)`
            : '';
          return `<span class="ins-bold">${val || '—'}</span>${pct2 ? `<br/><span class="ins-sm">${pct2}</span>` : ''}`;
        }
      )}
      ${bRow('Life insurance',
        b => {
          if (!b.lifeInsurance) return '—';
          const li  = b.lifeInsurance;
          const pctStr = li.percentage
            ? `${Number(li.percentage).toFixed(4)}% per month on outstanding loan amount`
            : '';
          const valStr = li.value ? `(AED ${fmtN(li.value)})` : '';
          return `<span class="ins-bold">${pctStr || '—'}</span>${valStr ? `<br/><span class="ins-sm">${valStr}</span>` : ''}`;
        }
      )}
      ${bRow('Over payment',
        b => san(b.overPaymentPolicy || b.overPaymentNote) || '—'
      )}
      ${bRow('Bank processing fee',
        b => {
          const fee  = b.snapshotProcessingFee != null ? aed(b.snapshotProcessingFee, 2) : 'AED 0';
          const pctS = b.processingFeePercentage
            ? `(${b.processingFeePercentage}% of loan amount)` : '';
          return `<span class="ins-bold">${fee}</span>${pctS ? `<br/><span class="ins-sm">${pctS}</span>` : ''}`;
        }
      )}
      ${bRow('Property valuation fee (fixed)',
        b => b.snapshotValuationFee != null ? aed(b.snapshotValuationFee) : '—'
      )}
      ${bRow('Early settlement fee',
        b => {
          const note = san(b.earlySettlementNote || b.earlySettlementFee);
          return note || '—';
        },
        '', 'font-size:10px;'
      )}
      ${bRow('Customer profile',
        b => san(b.customerProfile) || 'Standard'
      )}
      ${bRow('Additional information',
        b => {
          const info = san(b.additionalInfo)
            || (Array.isArray(b.keyFeatures)
                ? b.keyFeatures.map((f, i) => `Key Points:(${i + 1}) ${san(f)}`).join(' ')
                : '');
          return info
            ? `<span style="font-size:10px;text-align:left;display:block;">${info}</span>`
            : '—';
        },
        '', 'text-align:left;'
      )}
      ${bRow('Exclusive conditions (if applicable)',
        b => san(b.exclusiveConditions) || 'not applicable'
      )}
    </tbody>
  </table>

  <!-- ── TRANSACTION FEES ── -->
  <div class="sh">Transaction fees</div>
  <div style="font-size:10px;color:#333;padding:8px 0 12px;line-height:1.55;">
    Our philosophy is to provide our customers with a transparent approach to securing mortgage finance and explain
    the charges associated with purchasing property in UAE. There are various charges payable to several parties and
    we aim to clearly set out what to expect, in order to avoid unpleasant surprises at a later date.
  </div>
  <table style="margin-bottom:10px;">
    <thead>
      <tr>
        <td style="width:220px;background:#fafafa;border-color:#ccc;"></td>
        ${banks.map(b => `
          <td style="text-align:center;background:#fafafa;padding:10px 8px;border-color:#ccc;">
            ${b.bankLogo
              ? `<img src="${san(b.bankLogo)}" style="max-height:32px;max-width:110px;display:block;margin:0 auto;" />`
              : `<strong>${san(b.bankName)}</strong>`}
          </td>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${subHdr('Government fees')}
      <tr>
        <td>
          <div>Mortgage registration fee</div>
          <div style="font-size:10px;color:#777;">0.25 % of loan amount + AED 290</div>
        </td>
        ${banks.map(() => `<td style="text-align:center;">${aed(mortgageRegFee)}</td>`).join('')}
      </tr>
      <tr>
        <td>Mortgage release fee</td>
        ${banks.map(() => `<td style="text-align:center;">${aed(mortgageRelFee)}</td>`).join('')}
      </tr>
      <tr>
        <td>
          <div>Transfer center fee</div>
          <div style="font-size:10px;color:#777;">(fixed)(inclusive of VAT)</div>
        </td>
        ${banks.map(() => `<td style="text-align:center;">${aed(transferCtrFee)}</td>`).join('')}
      </tr>

      ${subHdr('Bank fees')}
      <tr>
        <td>Bank processing fee</td>
        ${banks.map(b => `<td style="text-align:center;">${b.snapshotProcessingFee != null ? aed(b.snapshotProcessingFee, 2) : 'AED 0'}</td>`).join('')}
      </tr>
      <tr>
        <td>Property valuation (fixed)</td>
        ${banks.map(b => `<td style="text-align:center;">${b.snapshotValuationFee != null ? aed(b.snapshotValuationFee) : '—'}</td>`).join('')}
      </tr>

      ${subHdr('Other fees')}
      <tr>
        <td>
          <div>Mortgage broker fee</div>
          <div style="font-size:10px;color:#777;">fixed fee (inclusive of VAT)</div>
        </td>
        ${banks.map(b => `<td style="text-align:center;">${aed(b.brokerFee || 0)}</td>`).join('')}
      </tr>

      <!-- totals -->
      <tr style="border-top:2px solid #999;font-weight:700;">
        <td>Total fees upfront</td>
        ${banks.map(b => `<td style="text-align:center;font-weight:700;">${aed(bankFeeTotal(b), 2)}</td>`).join('')}
      </tr>
      <tr>
        <td>Downpayment</td>
        ${banks.map(() => `<td style="text-align:center;">${aed(downPayment)}</td>`).join('')}
      </tr>
      <tr style="font-weight:700;">
        <td>Total required upfront</td>
        ${banks.map(b => `<td style="text-align:center;font-weight:700;">${aed(bankGrandTotal(b), 2)}</td>`).join('')}
      </tr>
    </tbody>
  </table>

  <!-- ── DISCLAIMER ── -->
  <div class="disc">
    <strong>Disclaimer:</strong> The stated transaction fees are for indicative purposes only and are subject to change without notice.
    VAT may be applied to any of the above charges without notice. Mortgage terms and conditions are subject to change.
  </div>
  <div class="imp">
    <strong>Important:</strong> The rates shown are based on the current daily EIBOR on the creation date of this proposal.
    Fees may vary on different dates.
    &nbsp;&nbsp;&nbsp;
    A pre-approval is valid for 30–90 days and varies from bank to bank.
  </div>

  <!-- ── REQUIRED DOCUMENTS ── -->
  <div class="sh">Required documents</div>
  <div class="dl">
    <div class="dl-t">Identification</div>
    <div class="dl-i">Passport and Visa copies</div>
    <div class="dl-i">Emirates identification card - front &amp; back</div>

    <div class="dl-t">Employment Details</div>
    <div class="dl-i">Salary letter - original to include name, nationality, passport number, start date, designation, basic income,
      fixed allowances and any variable or guaranteed bonuses. This should be signed by a named representative of the company and
      stamped with company stamp</div>
    <div class="dl-i">Latest 6 months' pay slips - originals or company stamped copies</div>

    <div class="dl-t">Bank Documents</div>
    <div class="dl-i">6 months' personal bank statements - originals or bank stamped copies. These must be up to 1 week of
      submitting the application and show latest 6 salary credits</div>
    <div class="dl-i">Latest credit card statement&nbsp;&nbsp;Cheque book for bank pre approval (application) fee, if any</div>

    <div class="dl-t">Supporting Documents</div>
    <div style="font-size:11px;color:#666;margin-bottom:4px;">Check if needed:</div>
    <div class="dl-i">If your current employment is less than 1 year, a letter or proof from your previous employer detailing length of service will be required</div>
    <div class="dl-i">Proof of deposit source</div>
    <div class="dl-i">Passport and visa copies of spouse</div>
    <div class="dl-i">Emirates identification card of spouse (front &amp; back copies)</div>
    <div class="dl-i">Attested marriage certificate copy</div>
    <div class="dl-i">If joint income of applicants is being considered for loan eligibility, full documentation for both required</div>
  </div>

</div>
</body>
</html>`;
};
