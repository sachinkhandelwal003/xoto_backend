const puppeteer = require('puppeteer');
const EiborRate = require('../models/EiborRate');

/**
 * Scrapes EIBOR rates from CBUAE website and saves them to the database.
 * @returns {Promise<Object>} The saved or retrieved EiborRate document.
 */
async function scrapeEiborRates() {
  let browser;
  try {
    console.log('Launching Puppeteer to fetch EIBOR rates...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('Navigating to Central Bank UAE EIBOR rates page...');
    await page.goto('https://www.centralbank.ae/en/forex-eibor/eibor-rates/', {
      waitUntil: 'networkidle2',
      timeout: 45000
    });

    console.log('Page loaded. Parsing tables...');
    const tablesData = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table'));
      return tables.map(table => {
        const rows = Array.from(table.querySelectorAll('tr'));
        return rows.map(row => {
          const cells = Array.from(row.querySelectorAll('td, th'));
          return cells.map(cell => cell.innerText.trim());
        });
      });
    });

    if (!tablesData || tablesData.length === 0 || tablesData[0].length < 2) {
      throw new Error('Failed to find EIBOR table data on the page.');
    }

    // Usually, the first table contains the latest rates
    // Row 0 is header: ["Date", "O/N", "1 Week", "1 Month", "3 Months", "6 Months", "1 Year", "Value Date"]
    // Row 1 is the latest row of rates
    const firstTable = tablesData[0];
    const headers = firstTable[0].map(h => h.toLowerCase());
    const latestRow = firstTable[1];

    if (!latestRow || latestRow.length < 7) {
      throw new Error('Latest EIBOR row does not contain sufficient columns.');
    }

    // Map columns dynamically or by index
    const dateIdx = headers.findIndex(h => h.includes('date') && !h.includes('value'));
    const onIdx = headers.findIndex(h => h.includes('o/n') || h.includes('overnight'));
    const w1Idx = headers.findIndex(h => h.includes('1 week') || h.includes('wk') || h.includes('1w'));
    const m1Idx = headers.findIndex(h => h.includes('1 month') || h.includes('1m'));
    const m3Idx = headers.findIndex(h => h.includes('3 month') || h.includes('3m'));
    const m6Idx = headers.findIndex(h => h.includes('6 month') || h.includes('6m'));
    const y1Idx = headers.findIndex(h => h.includes('1 year') || h.includes('1y'));

    // Safe indices with fallbacks
    const dateStr = latestRow[dateIdx !== -1 ? dateIdx : 0];
    const overnight = parseFloat(latestRow[onIdx !== -1 ? onIdx : 1]);
    const oneWeek = parseFloat(latestRow[w1Idx !== -1 ? w1Idx : 2]);
    const oneMonth = parseFloat(latestRow[m1Idx !== -1 ? m1Idx : 3]);
    const threeMonths = parseFloat(latestRow[m3Idx !== -1 ? m3Idx : 4]);
    const sixMonths = parseFloat(latestRow[m6Idx !== -1 ? m6Idx : 5]);
    const oneYear = parseFloat(latestRow[y1Idx !== -1 ? y1Idx : 6]);

    if (!dateStr || isNaN(overnight) || isNaN(oneWeek) || isNaN(oneMonth) || isNaN(threeMonths) || isNaN(sixMonths) || isNaN(oneYear)) {
      throw new Error(`Parsing error. Extracted row: ${JSON.stringify(latestRow)}`);
    }

    console.log(`Successfully scraped EIBOR rates for date ${dateStr}:`, {
      overnight, oneWeek, oneMonth, threeMonths, sixMonths, oneYear
    });

    // Check if we already have rates for this date to avoid duplicate entries
    let rateDoc = await EiborRate.findOne({ lastUpdatedDate: dateStr });
    if (!rateDoc) {
      rateDoc = new EiborRate({
        lastUpdatedDate: dateStr,
        overnight,
        oneWeek,
        oneMonth,
        threeMonths,
        sixMonths,
        oneYear,
        fetchedAt: new Date()
      });
      await rateDoc.save();
      console.log('Saved new EIBOR rate document to database.');
    } else {
      console.log('EIBOR rates for this date already cached in database.');
    }

    return rateDoc;
  } catch (error) {
    console.error('Error scraping EIBOR rates:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = {
  scrapeEiborRates
};
