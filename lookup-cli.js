'use strict';
/**
 * The gap identified during the first real sale, closed end-to-end:
 * customer types a plain company/ticker or person name, this resolves it
 * and produces the same report format already validated live.
 *
 * Usage: node lookup-cli.js "Clean Harbors"
 *        node lookup-cli.js "Alan McKim"
 */

const { resolveCompany, resolvePerson } = require('./resolve.js');
const { fetchHistoricalPattern } = require('./edgar.js');

async function main() {
  const query = process.argv.slice(2).join(' ');
  if (!query) {
    console.error('Usage: node lookup-cli.js "<company, ticker, or person name>"');
    process.exit(1);
  }

  // Company/ticker first: company_tickers.json is a small, curated, exact-
  // match dataset (~10K real public companies) -- low false-positive risk.
  // Person search falls back to EDGAR's full entity database, which is
  // broad and noisy (confirmed live: it matches subsidiaries and trusts,
  // not just individuals) -- trying it first was the bug that made
  // "Clean Harbors" return five unrelated subsidiary LLCs instead of the
  // one real ticker match.
  let resolved = await resolveCompany(query);
  let kind = 'company';
  if (resolved.status === 'not_found') {
    resolved = await resolvePerson(query);
    kind = 'person';
  }

  if (resolved.status === 'not_found') {
    console.log(`No match found for "${query}". Try a full name or the exact ticker.`);
    return;
  }

  if (resolved.status === 'ambiguous') {
    console.log(`Multiple matches for "${query}" -- reply with the one you mean:`);
    resolved.candidates.forEach((c, i) => console.log(`  ${i + 1}. ${c.name}${c.ticker ? ' (' + c.ticker + ')' : ''} -- CIK ${c.cik}`));
    return;
  }

  console.log(`Matched (${kind}): ${resolved.name}${resolved.ticker ? ' (' + resolved.ticker + ')' : ''} -- CIK ${resolved.cik}`);
  const history = await fetchHistoricalPattern(resolved.cik);
  console.log(`Total Form 4 filings on record: ${history.totalForm4Filings}`);
  console.log(`Most recent: ${history.mostRecentDates.slice(0, 5).join(', ')}`);
  console.log(`Earliest on record: ${history.firstKnownDate}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
