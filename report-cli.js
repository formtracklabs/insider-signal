'use strict';
/**
 * The one entry point for the actual $9 deliverable. Before this existed,
 * fulfilling a paid order meant manually chaining several scripts and raw
 * SEC calls by hand -- this is that chain, as a single command.
 *
 * Usage: node report-cli.js "Clean Harbors"
 *        node report-cli.js "Alan McKim"
 *        node report-cli.js "Nvidia" 15   (optional: how many filings, default 10)
 */

const { generateFullReport } = require('./full-report.js');

async function main() {
  const args = process.argv.slice(2);
  const limitArg = Number(args[args.length - 1]);
  const hasLimit = !Number.isNaN(limitArg);
  const query = (hasLimit ? args.slice(0, -1) : args).join(' ');
  const limit = hasLimit ? limitArg : 10;

  if (!query) {
    console.error('Usage: node report-cli.js "<company, ticker, or person name>" [filing count]');
    process.exit(1);
  }

  const result = await generateFullReport(query, limit);

  if (result.status === 'not_found') {
    console.log(`No match found for "${query}". Try a full name or the exact ticker.`);
    return;
  }
  if (result.status === 'ambiguous') {
    console.log(`Multiple matches for "${query}" -- reply with the one you mean:`);
    result.candidates.forEach((c, i) => console.log(`  ${i + 1}. ${c.name}${c.ticker ? ' (' + c.ticker + ')' : ''} -- CIK ${c.cik}`));
    return;
  }
  if (result.status === 'multiple_insiders') {
    console.log(result.message);
    result.candidates.forEach((c, i) => console.log(`  ${i + 1}. ${c.name} -- CIK ${c.cik}`));
    console.log('Re-run with the specific person\'s name.');
    return;
  }

  console.log(result.text);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
