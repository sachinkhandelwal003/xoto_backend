// services/eligibilityService.js
const LeadEligibilityCheck = require("../models/LeadEligibilityCheck");

// Helper functions
const calculateEMI = (principal, annualRate, tenureYears) => {
  if (!principal || principal <= 0) return 0;
  const monthlyRate = annualRate / 100 / 12;
  const months = tenureYears * 12;
  if (monthlyRate === 0) return principal / months;
  return Math.round(principal * monthlyRate * Math.pow(1 + monthlyRate, months) / (Math.pow(1 + monthlyRate, months) - 1));
};

const calculateCustomerAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const ageDiff = Date.now() - new Date(dateOfBirth).getTime();
  const ageDate = new Date(ageDiff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
};

const calculateEligibility = (lead, inputs) => {
  const {
    monthlySalary,
    otherIncome,
    existingLoanEMIs,
    creditCardPayments,
    propertyValue,
    requestedLoanAmount,
    tenureYears,
    nationality,
    dateOfBirth
  } = inputs;

  // =========================
  // INCOME CALCULATION
  // =========================
  const totalMonthlyIncome = (monthlySalary || 0) + (otherIncome || 0);
  const existingLiabilities = (existingLoanEMIs || 0) + (creditCardPayments || 0);

  // =========================
  // CUSTOMER TYPE
  // =========================
  const isUAENational = ["UAE National", "Emirati", "United Arab Emirates"].includes(nationality);
  const isNonResident = lead?.customerInfo?.residencyStatus === "Non-Resident";

  // =========================
  // LTV CALCULATION
  // =========================
  let maxLTV = 85;
  if (isNonResident) maxLTV = 75;
  else if (!isUAENational) maxLTV = 80;
  if (propertyValue > 5000000) maxLTV = Math.min(maxLTV, 70);

  const maxLoanByLTV = propertyValue > 0 ? propertyValue * (maxLTV / 100) : 0;
  const ltv = (propertyValue > 0 && requestedLoanAmount > 0) ? (requestedLoanAmount / propertyValue) * 100 : 0;

  // =========================
  // DBR CALCULATION
  // =========================
  const stressInterestRate = 7.0;
  const months = tenureYears * 12;
  const proposedEMI = calculateEMI(requestedLoanAmount, stressInterestRate, tenureYears);
  const totalCommitments = proposedEMI + existingLiabilities;
  
  const maxAllowedDBR = isUAENational ? 55 : 50;
  let dbrPercentage = 0;
  let dbrStatus = "Eligible";

  if (totalMonthlyIncome > 0) {
    dbrPercentage = (totalCommitments / totalMonthlyIncome) * 100;
    if (dbrPercentage > maxAllowedDBR) dbrStatus = "Ineligible";
    else if (dbrPercentage > maxAllowedDBR - 5) dbrStatus = "Borderline";
  }

  // =========================
  // AGE VALIDATION
  // =========================
  const customerAge = calculateCustomerAge(dateOfBirth);
  const ageAtMaturity = (customerAge || 0) + tenureYears;

  // =========================
  // MAX LOAN BASED ON DBR
  // =========================
  let maxLoanAmountBasedOnDBR = 0;
  if (totalMonthlyIncome > 0 && maxAllowedDBR > 0) {
    const maxEMIPossible = (totalMonthlyIncome * maxAllowedDBR / 100) - existingLiabilities;
    if (maxEMIPossible > 0) {
      const monthlyRate = stressInterestRate / 100 / 12;
      if (monthlyRate > 0) {
        maxLoanAmountBasedOnDBR = maxEMIPossible * (Math.pow(1 + monthlyRate, months) - 1) / (monthlyRate * Math.pow(1 + monthlyRate, months));
      } else {
        maxLoanAmountBasedOnDBR = maxEMIPossible * months;
      }
      maxLoanAmountBasedOnDBR = Math.round(maxLoanAmountBasedOnDBR);
    }
  }

  // =========================
  // FINAL RECOMMENDATION
  // =========================
  const recommendedLoanAmount = Math.min(maxLoanByLTV || requestedLoanAmount, maxLoanAmountBasedOnDBR || requestedLoanAmount);
  const isEligible = dbrStatus === "Eligible" && requestedLoanAmount <= recommendedLoanAmount && ageAtMaturity <= 65;

  // =========================
  // ELIGIBILITY SCORE
  // =========================
  let eligibilityScore = 100;
  if (dbrPercentage > 40) eligibilityScore -= 20;
  if (ltv > 80) eligibilityScore -= 20;
  if (ageAtMaturity > 60) eligibilityScore -= 10;
  if (monthlySalary < 15000) eligibilityScore -= 10;
  eligibilityScore = Math.max(0, eligibilityScore);

  // =========================
  // RISK GRADE
  // =========================
  let riskGrade = "Excellent";
  if (eligibilityScore < 90) riskGrade = "Good";
  if (eligibilityScore < 75) riskGrade = "Average";
  if (eligibilityScore < 60) riskGrade = "Risky";

  // =========================
  // ELIGIBILITY NOTES
  // =========================
  let eligibilityNotes = null;
  if (ageAtMaturity > 65) {
    eligibilityNotes = `Age at loan maturity (${ageAtMaturity}) exceeds allowed limit of 65 years`;
  } else if (dbrStatus !== "Eligible") {
    eligibilityNotes = `DBR too high: ${dbrPercentage.toFixed(1)}% (Maximum allowed: ${maxAllowedDBR}%)`;
  } else if (requestedLoanAmount > maxLoanByLTV) {
    eligibilityNotes = `Loan amount exceeds LTV limit: LTV ${ltv.toFixed(1)}% (Maximum allowed: ${maxLTV}%)`;
  } else if (requestedLoanAmount > maxLoanAmountBasedOnDBR) {
    eligibilityNotes = `Loan exceeds affordability. Maximum eligible amount based on your income is AED ${maxLoanAmountBasedOnDBR.toLocaleString()}`;
  } else if (isEligible) {
    eligibilityNotes = `✓ Eligible! You can get a loan up to AED ${recommendedLoanAmount.toLocaleString()}`;
  }

  return {
    totalMonthlyIncome,
    totalLiabilities: existingLiabilities,
    proposedEMI,
    dbrPercentage: Math.round(dbrPercentage * 100) / 100,
    maxAllowedDBR,
    dbrStatus,
    estimatedLTV: Math.round(ltv * 100) / 100,
    maxLTV,
    maxLoanAmountBasedOnDBR,
    recommendedLoanAmount,
    isEligible,
    eligibilityNotes,
    eligibilityScore,
    riskGrade,
    ageAtMaturity,
    customerAge
  };
};

module.exports = { calculateEligibility, calculateEMI, calculateCustomerAge };