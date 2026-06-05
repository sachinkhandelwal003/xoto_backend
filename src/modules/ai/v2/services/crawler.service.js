const puppeteer = require('puppeteer');
const WebsiteKnowledge = require('../models/WebsiteKnowledge');

const BASE_URL = 'https://xoto.ae';

const KEY_PAGES = [
  { path: '/',             keywords: ['home', 'xoto', 'property', 'ai', 'ecosystem'] },
  { path: '/landscaping',  keywords: ['landscaping', 'garden', 'outdoor', 'pergola', 'pool', 'hardscape', 'softscape'] },
  { path: '/interiors',    keywords: ['interior', 'design', 'kitchen', 'wardrobe', 'ceiling', 'flooring'] },
  { path: '/properties',   keywords: ['property', 'buy', 'villa', 'apartment', 'townhouse', 'off-plan'] },
  { path: '/rent',         keywords: ['rent', 'rental', 'lease', 'tenancy'] },
  { path: '/sell',         keywords: ['sell', 'valuation', 'listing', 'market'] },
  { path: '/mortgage',     keywords: ['mortgage', 'loan', 'vault', 'bank', 'finance', 'emi'] },
  { path: '/about',        keywords: ['about', 'company', 'team', 'mission', 'vision'] },
  { path: '/contact',      keywords: ['contact', 'email', 'phone', 'support', 'reach'] },
  { path: '/marketplace',  keywords: ['marketplace', 'furniture', 'decor', 'shop', 'product'] },
  { path: '/services',     keywords: ['services', 'offerings', 'solutions'] },
];

async function crawlSinglePage(browser, path, keywords) {
  const url = `${BASE_URL}${path}`;
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
    );
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    // Give React time to hydrate
    await new Promise(r => setTimeout(r, 2500));

    const data = await page.evaluate(() => {
      const title       = document.title || '';
      const metaDesc    = document.querySelector('meta[name="description"]');
      const description = metaDesc ? metaDesc.content : '';

      // Remove noisy elements
      const clone = document.body.cloneNode(true);
      ['script', 'style', 'noscript', 'svg', 'iframe'].forEach(tag =>
        clone.querySelectorAll(tag).forEach(el => el.remove())
      );
      const content = clone.innerText.replace(/\s+/g, ' ').trim().substring(0, 8000);

      // Extract headings + following text as sections
      const sections = [];
      document.querySelectorAll('h1, h2, h3').forEach(h => {
        const heading = h.textContent.trim();
        if (!heading || heading.length < 3) return;
        let text  = '';
        let next  = h.nextElementSibling;
        let count = 0;
        while (next && !['H1', 'H2', 'H3'].includes(next.tagName) && count < 3) {
          text += ' ' + next.textContent.trim();
          next  = next.nextElementSibling;
          count++;
        }
        sections.push({ heading, text: text.trim().substring(0, 400) });
      });

      return { title, description, content, sections };
    });

    await WebsiteKnowledge.findOneAndUpdate(
      { url },
      { url, path, keywords, ...data, lastCrawled: new Date() },
      { upsert: true, new: true }
    );

    console.log(`✅ Crawled: ${url}`);
    return { success: true, url, title: data.title };
  } catch (err) {
    console.error(`❌ Failed: ${url} — ${err.message}`);
    return { success: false, url, error: err.message };
  } finally {
    await page.close();
  }
}

async function crawlWebsite() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const results = [];
  for (const p of KEY_PAGES) {
    const result = await crawlSinglePage(browser, p.path, p.keywords);
    results.push(result);
  }

  await browser.close();
  return results;
}

async function searchWebsiteKnowledge(query) {
  // Primary: MongoDB full-text search
  let results = await WebsiteKnowledge.find(
    { $text: { $search: query } },
    { score: { $meta: 'textScore' } }
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(3)
    .lean();

  // Fallback: regex search
  if (results.length === 0) {
    results = await WebsiteKnowledge.find({
      $or: [
        { title:    new RegExp(query, 'i') },
        { content:  new RegExp(query, 'i') },
        { keywords: { $in: [new RegExp(query, 'i')] } }
      ]
    }).limit(3).lean();
  }

  return results.map(r => ({
    url:         r.url,
    title:       r.title,
    description: r.description,
    summary:     r.content.substring(0, 600),
    sections:    (r.sections || []).slice(0, 4)
  }));
}

module.exports = { crawlWebsite, searchWebsiteKnowledge };
