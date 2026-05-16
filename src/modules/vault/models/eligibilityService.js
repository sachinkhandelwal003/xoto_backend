
export const calculateEMI = (principal, annualRate, tenureYears) => {
  if (!principal || principal <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = tenureYears * 12;
  if (r === 0) return Math.round(principal / n);
  return Math.round(principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
};

export const calculateCustomerAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  return Math.floor(
    (Date.now() - new Date(dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000)
  );
};

// ══════════════════════════════════════════════════════════════════
// MAIN ELIGIBILITY CALCULATION
// PRD logic:
//   DBR max = 50% for Expats, 55% for UAE Nationals
//   LTV max = 85% National, 80% Resident, 75% Non-Resident
//   LTV max = 70% if property > 5M AED
//   Age at maturity must be ≤ 65 years
//   Stress rate = 7% (always fixed for eligibility check)
// ══════════════════════════════════════════════════════════════════

export const calculateEligibility = (lead, inputs) => {
  const {
    monthlySalary,
    otherIncome,
    existingLoanEMIs,
    creditCardPayments,
    propertyValue,
    requestedLoanAmount,
    tenureYears,
    nationality,
    dateOfBirth,
  } = inputs;

  // ── Income ────────────────────────────────────────────────────
  const totalMonthlyIncome  = (monthlySalary || 0) + (otherIncome || 0);
  const existingLiabilities = (existingLoanEMIs || 0) + (creditCardPayments || 0);

  // ── Customer type ────────────────────────────────────────────
  const isUAENational = ['UAE National', 'Emirati', 'United Arab Emirates'].includes(nationality);
  const isNonResident = lead?.customerInfo?.residencyStatus === 'Non-Resident';

  // ── LTV ──────────────────────────────────────────────────────
  let maxLTV = 85;
  if      (isNonResident)   maxLTV = 75;
  else if (!isUAENational)  maxLTV = 80;
  if (propertyValue > 5000000) maxLTV = Math.min(maxLTV, 70);

  const maxLoanByLTV = propertyValue > 0 ? propertyValue * (maxLTV / 100) : 0;
  const ltv = (propertyValue > 0 && requestedLoanAmount > 0)
    ? (requestedLoanAmount / propertyValue) * 100
    : 0;

  // ── DBR — stress rate always 7% ──────────────────────────────
  const stressRate   = 7.0;
  const n            = tenureYears * 12;
  const proposedEMI  = calculateEMI(requestedLoanAmount, stressRate, tenureYears);
  const totalCommitments = proposedEMI + existingLiabilities;

  const maxAllowedDBR = isUAENational ? 55 : 50;
  let dbrPercentage   = 0;
  let dbrStatus       = 'Eligible';

  if (totalMonthlyIncome > 0) {
    dbrPercentage = (totalCommitments / totalMonthlyIncome) * 100;
    if      (dbrPercentage > maxAllowedDBR)     dbrStatus = 'Ineligible';
    else if (dbrPercentage > maxAllowedDBR - 5) dbrStatus = 'Borderline';
  }

  // ── Age ──────────────────────────────────────────────────────
  const customerAge   = calculateCustomerAge(dateOfBirth);
  const ageAtMaturity = (customerAge || 0) + tenureYears;

  // ── Max loan based on DBR ────────────────────────────────────
  let maxLoanAmountBasedOnDBR = 0;
  if (totalMonthlyIncome > 0) {
    const maxEMIPossible = (totalMonthlyIncome * maxAllowedDBR / 100) - existingLiabilities;
    if (maxEMIPossible > 0) {
      const r = stressRate / 100 / 12;
      maxLoanAmountBasedOnDBR = r > 0
        ? Math.round(maxEMIPossible * (Math.pow(1 + r, n) - 1) / (r * Math.pow(1 + r, n)))
        : Math.round(maxEMIPossible * n);
    }
  }

  // ── Final recommended loan ───────────────────────────────────
  const recommendedLoanAmount = Math.min(
    maxLoanByLTV             || requestedLoanAmount,
    maxLoanAmountBasedOnDBR  || requestedLoanAmount
  );

  const isEligible =
    dbrStatus === 'Eligible' &&
    requestedLoanAmount <= recommendedLoanAmount &&
    ageAtMaturity <= 65;

  // ── Eligibility score ────────────────────────────────────────
  let eligibilityScore = 100;
  if (dbrPercentage  > 40)   eligibilityScore -= 20;
  if (ltv            > 80)   eligibilityScore -= 20;
  if (ageAtMaturity  > 60)   eligibilityScore -= 10;
  if ((monthlySalary || 0) < 15000) eligibilityScore -= 10;
  eligibilityScore = Math.max(0, eligibilityScore);

  // ── Risk grade ───────────────────────────────────────────────
  let riskGrade = 'Excellent';
  if      (eligibilityScore < 90) riskGrade = 'Good';
  else if (eligibilityScore < 75) riskGrade = 'Average';
  else if (eligibilityScore < 60) riskGrade = 'Risky';

  // ── Eligibility notes ────────────────────────────────────────
  let eligibilityNotes = null;
  if      (ageAtMaturity > 65)
    eligibilityNotes = `Age at maturity (${ageAtMaturity}y) exceeds limit of 65 years`;
  else if (dbrStatus !== 'Eligible')
    eligibilityNotes = `DBR too high: ${dbrPercentage.toFixed(1)}% (max allowed: ${maxAllowedDBR}%)`;
  else if (requestedLoanAmount > maxLoanByLTV)
    eligibilityNotes = `Loan exceeds LTV limit. Current LTV: ${ltv.toFixed(1)}% (max: ${maxLTV}%)`;
  else if (requestedLoanAmount > maxLoanAmountBasedOnDBR)
    eligibilityNotes = `Loan exceeds income capacity. Max eligible: AED ${maxLoanAmountBasedOnDBR.toLocaleString()}`;
  else if (isEligible)
    eligibilityNotes = `Eligible. Max loan up to AED ${recommendedLoanAmount.toLocaleString()}`;

  return {
    totalMonthlyIncome,
    totalLiabilities:        existingLiabilities,
    proposedEMI,
    dbrPercentage:           Math.round(dbrPercentage * 100) / 100,
    maxAllowedDBR,
    dbrStatus,
    estimatedLTV:            Math.round(ltv * 100) / 100,
    maxLTV,
    maxLoanAmountBasedOnDBR,
    recommendedLoanAmount,
    isEligible,
    eligibilityNotes,
    eligibilityScore,
    riskGrade,
    ageAtMaturity,
    customerAge,
  };
};