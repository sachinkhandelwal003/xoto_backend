const fs = require('fs');
const content = fs.readFileSync('D:/xoto_backend/src/modules/mortgages/controllers/bankMortgageProduct.controller.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('updateBank')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
