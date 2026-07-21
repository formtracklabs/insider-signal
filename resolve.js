'use strict';
/**
 * Resolves a customer's plain-text input (company name, ticker, or person
 * name) to a SEC CIK -- closing the gap flagged during the first manual
 * sale. Every source here is SEC's own official public infrastructure;
 * no third-party service, no paid API, nothing that can be deprecated out
 * from under us the way Upwork's RSS was.
 *
 * Two real constraints discovered while building this, not assumed:
 * 1. Company/ticker resolution is a single static SEC file -- exact-match
 *    and fast, no rate-limit exposure since it's cached once, not queried
 *    per request.
 * 2. Person-name resolution reuses the same browse-edgar endpoint discovery.js
 *    already depends on. When a name is genuinely ambiguous (e.g. "Smith John"),
 *    SEC's own multi-match response does NOT include names in that feed --
 *    only CIK + address + last filing date. Silently picking the first match
 *    risks handing a customer a stranger's trading history. This resolver
 *    surfaces candidates for confirmation instead of guessing.
 */

const USER_AGENT = 'InsiderSignal research@example.com';
const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';

let tickerCache = null;

async function loadTickerIndex() {
  if (tickerCache) return tickerCache;
  const res = await fetch(TICKERS_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Could not load SEC ticker index (HTTP ${res.status})`);
  const data = await res.json();
  tickerCache = Object.values(data); // [{cik_str, ticker, title}, ...]
  return tickerCache;
}

/**
 * @param {string} query - a ticker ("CLH") or a company name fragment ("Clean Harbors")
 * @returns {Promise<{status:'found', cik:string, ticker:string, name:string} | {status:'ambiguous', candidates:Array} | {status:'not_found'}>}
 */
async function resolveCompany(query) {
  const index = await loadTickerIndex();
  const q = query.trim().toLowerCase();

  const exactTicker = index.find(c => c.ticker.toLowerCase() === q);
  if (exactTicker) {
    return { status: 'found', cik: String(exactTicker.cik_str), ticker: exactTicker.ticker, name: exactTicker.title };
  }

  const nameMatches = index.filter(c => c.title.toLowerCase().includes(q));
  if (nameMatches.length === 1) {
    const m = nameMatches[0];
    return { status: 'found', cik: String(m.cik_str), ticker: m.ticker, name: m.title };
  }
  if (nameMatches.length > 1) {
    return { status: 'ambiguous', candidates: nameMatches.slice(0, 8).map(m => ({ cik: String(m.cik_str), ticker: m.ticker, name: m.title })) };
  }
  return { status: 'not_found' };
}

/**
 * @param {string} query - a person's name, e.g. "Alan McKim" or "McKim Alan"
 * @returns {Promise<{status:'found', cik:string, name:string} | {status:'ambiguous', candidates:Array} | {status:'not_found'}>}
 */
async function searchPersonRaw(query) {
  const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(query)}&type=4&dateb=&owner=include&count=40&output=atom`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`SEC person search failed (HTTP ${res.status})`);
  return res.text();
}

/**
 * SEC's own filer records are conformed as "LASTNAME FIRSTNAME [MIDDLE]".
 * A customer typing the natural "Alan McKim" order returns nothing against
 * that convention (confirmed live) -- if the direct query comes back empty,
 * retry once with the word order reversed before giving up.
 */
async function resolvePerson(query) {
  let xml = await searchPersonRaw(query);
  if (!/<cik>/.test(xml)) {
    const words = query.trim().split(/\s+/);
    if (words.length >= 2) {
      const reversed = [words[words.length - 1], ...words.slice(0, -1)].join(' ');
      xml = await searchPersonRaw(reversed);
    }
  }

  // Single-match response: SEC returns this person's actual filing history,
  // with a clean <conformed-name> we can read directly.
  const singleName = xml.match(/<conformed-name>([^<]+)<\/conformed-name>/);
  const singleCik = xml.match(/<cik>(\d+)<\/cik>/);
  if (singleName && singleCik) {
    return { status: 'found', cik: singleCik[1], name: singleName[1].trim() };
  }

  // Multi-match response: only CIKs are present, no names -- must resolve
  // each candidate's real name via data.sec.gov before presenting a choice.
  const cikMatches = [...xml.matchAll(/<cik>(\d+)<\/cik>/g)];
  const uniqueCiks = [...new Set(cikMatches.map(m => m[1]))];
  if (uniqueCiks.length === 0) return { status: 'not_found' };

  const candidates = [];
  for (const cik of uniqueCiks.slice(0, 5)) {
    try {
      const padded = cik.padStart(10, '0');
      const subRes = await fetch(`https://data.sec.gov/submissions/CIK${padded}.json`, { headers: { 'User-Agent': USER_AGENT } });
      const subData = await subRes.json();
      candidates.push({ cik, name: subData.name || '(unknown)' });
    } catch {
      candidates.push({ cik, name: '(lookup failed)' });
    }
  }
  return uniqueCiks.length === 1
    ? { status: 'found', cik: candidates[0].cik, name: candidates[0].name }
    : { status: 'ambiguous', candidates };
}

module.exports = { resolveCompany, resolvePerson };
