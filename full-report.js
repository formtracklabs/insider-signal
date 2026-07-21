'use strict';
/**
 * Generates the actual $9 paid report end-to-end from one entry point.
 * Before this, "the full report" meant manually chaining resolve.js +
 * fetchHistoricalPattern (dates only, no transaction detail) + parseFiling
 * (one filing at a time) by hand -- reproduced live during the commercial
 * audit and confirmed too slow/error-prone to be what's actually sold.
 * This is that missing link, as one function.
 */

const { resolveCompany, resolvePerson } = require('./resolve.js');
const { fetchRecentForm4IndexUrls, parseFiling } = require('./edgar.js');
const { TXN_LABELS } = require('./format-alert.js');

/**
 * @param {string} query - company, ticker, or person name
 * @param {number} limit - how many of the most recent Form 4 filings to include
 * @returns {Promise<{status:'found', text:string, meta:object} | {status:'ambiguous'|'multiple_insiders', candidates:Array, message?:string} | {status:'not_found'}>}
 */
async function generateFullReport(query, limit = 10) {
  let resolved = await resolveCompany(query);
  let kind = 'company';
  if (resolved.status === 'not_found') {
    resolved = await resolvePerson(query);
    kind = 'person';
  }
  if (resolved.status !== 'found') return resolved;

  const recentFilings = await fetchRecentForm4IndexUrls(resolved.cik, limit);
  const rows = [];
  for (const { filingDate, indexUrl } of recentFilings) {
    try {
      const f = await parseFiling(indexUrl);
      rows.push({ filingDate, ...f });
    } catch (e) {
      rows.push({ filingDate, transactionCode: null, error: e.message, xmlUrl: indexUrl });
    }
  }

  // A company's own CIK carries Form 4s from every insider who filed against
  // it -- confirmed live (Nvidia: five different directors' identical grants
  // on one day, read back as if they were one person's "pattern"). Naming a
  // ticker is not the same question as naming an insider; surface the real
  // people found instead of mashing their unrelated transactions together.
  if (kind === 'company') {
    const distinctOwners = new Map();
    for (const r of rows) {
      if (r.ownerCik) distinctOwners.set(r.ownerCik, r.ownerName);
    }
    if (distinctOwners.size > 1) {
      return {
        status: 'multiple_insiders',
        message: `"${query}" is a company with several different insiders filing recently -- a pattern only means something for one specific person. Which one do you mean?`,
        candidates: [...distinctOwners.entries()].map(([cik, name]) => ({ cik, name }))
      };
    }
  }

  const sales = rows.filter(r => r.transactionCode === 'S').length;
  const purchases = rows.filter(r => r.transactionCode === 'P').length;
  const verdict = purchases > sales ? 'NET BUYER' : sales > purchases ? 'NET SELLER' : 'MIXED / NO CLEAR PATTERN';

  // Always prefer the real parsed filing data over the resolved query --
  // for a person query it matches anyway; for a company query with a single
  // consistent filer (the case that survives the check above), the person's
  // real name only exists in the parsed rows, not in the company-index match.
  const ownerLabel = rows.find(r => r.ownerName)?.ownerName || resolved.name;
  const issuerLabel = rows.find(r => r.issuerName)?.issuerName
    ? `${rows.find(r => r.issuerName).issuerName}${rows.find(r => r.issuerTicker)?.issuerTicker ? ' (' + rows.find(r => r.issuerTicker).issuerTicker + ')' : ''}`
    : (kind === 'company' ? `${resolved.name}${resolved.ticker ? ' (' + resolved.ticker + ')' : ''}` : '(issuer varies)');

  const lines = [
    `FormTrack full pattern report`,
    `${ownerLabel} -- ${issuerLabel}`,
    `Verdict: ${verdict} (${sales} open-market sale${sales === 1 ? '' : 's'}, ${purchases} purchase${purchases === 1 ? '' : 's'}, out of the last ${rows.length} Form 4 filings)`,
    '',
    'Date         Type                                              Shares      Price',
    '-----------  ------------------------------------------------  ----------  --------'
  ];
  for (const r of rows) {
    if (r.error) {
      lines.push(`${(r.filingDate || '?').padEnd(11)}  (could not parse this filing -- ${r.error})`);
      continue;
    }
    const label = (TXN_LABELS[r.transactionCode] || r.transactionCode || 'Unknown').padEnd(50);
    const shares = (r.transactionShares ? Number(r.transactionShares).toLocaleString('en-US') : '--').padStart(10);
    const price = (r.transactionPrice && Number(r.transactionPrice) > 0 ? '$' + r.transactionPrice : '--').padStart(8);
    lines.push(`${(r.transactionDate || r.filingDate || '?').padEnd(11)}  ${label}${shares}  ${price}`);
  }
  lines.push('', 'Source: SEC EDGAR (data.sec.gov, sec.gov) -- every row traces to a citable Form 4 filing.', 'FormTrack is not investment advice.');

  return {
    status: 'found',
    text: lines.join('\n'),
    meta: { kind, cik: resolved.cik, ticker: resolved.ticker || null, verdict, sales, purchases, filingCount: rows.length }
  };
}

module.exports = { generateFullReport };
