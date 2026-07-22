'use strict';
/**
 * Generates the styled HTML version of the paid report and saves it to a
 * file -- attach it directly, or open it and print to PDF. No server, no
 * new infrastructure; same data generateFullReport() already computes.
 *
 * Usage: node html-report-cli.js "Alan McKim"
 *        node html-report-cli.js "Alan McKim" 10 my-report.html
 */

const fs = require('fs');
const path = require('path');
const { generateFullReport } = require('./full-report.js');
const { renderHtmlReport } = require('./render-html-report.js');

async function main() {
  const args = process.argv.slice(2);
  // Explicit arg parsing: a trailing .html arg is the output path (optional),
  // a trailing numeric arg after that is the filing limit (optional),
  // everything remaining is the query.
  let outPath = null;
  let rest = [...args];
  if (rest.length && /\.html$/i.test(rest[rest.length - 1])) {
    outPath = rest.pop();
  }
  let limit = 10;
  if (rest.length > 1 && !Number.isNaN(Number(rest[rest.length - 1]))) {
    limit = Number(rest.pop());
  }
  const finalQuery = rest.join(' ');

  if (!finalQuery) {
    console.error('Usage: node html-report-cli.js "<company, ticker, or person name>" [filing count] [output.html]');
    process.exit(1);
  }

  const result = await generateFullReport(finalQuery, limit);

  if (result.status === 'not_found') {
    console.log(`No match found for "${finalQuery}". Try a full name or the exact ticker.`);
    return;
  }
  if (result.status === 'ambiguous' || result.status === 'multiple_insiders') {
    console.log(result.message || `Multiple matches for "${finalQuery}" -- reply with the one you mean:`);
    result.candidates.forEach((c, i) => console.log(`  ${i + 1}. ${c.name}${c.ticker ? ' (' + c.ticker + ')' : ''} -- CIK ${c.cik}`));
    return;
  }

  const html = renderHtmlReport(result);
  const finalOutPath = outPath || path.join(__dirname, 'data', `report-${finalQuery.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html`);
  fs.mkdirSync(path.dirname(finalOutPath), { recursive: true });
  fs.writeFileSync(finalOutPath, html, 'utf-8');
  console.log(`Saved: ${finalOutPath}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
