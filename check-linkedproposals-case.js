const fs = require('fs');
const file = 'D:\\xoto_vault\\src\\components\\common\\LinkedProposalsCases.jsx';
const lines = fs.readFileSync(file, 'utf8').split('\n');
lines.forEach((line, idx) => {
  if (/case/i.test(line) && !/switch|import|caseReference|caseData|caseId|caseTimeline|caseStatus|caseIndex|caseItem|onSelectCase|fetchCases|statusCases|activeCases|get/i.test(line)) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
