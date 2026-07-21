'use strict';
/**
 * SEC EDGAR client -- public, free, no API key. Every endpoint here was
 * verified live against real current data before this module was written.
 *
 * Three real data layers, confirmed working:
 * 1. Current Form 4 filings (browse-edgar getcurrent + exact category term
 *    match -- the type= param does PREFIX matching, so "4" also matches
 *    "424B2"; the fix is filtering on <category term="4"> exactly, found by
 *    inspecting a real raw entry, not guessed).
 * 2. Per-filing transaction detail (the raw Form 4 XML: issuer, reporting
 *    owner, role, 10b5-1 flag, transaction code/shares/price).
 * 3. Per-person historical filing pattern (data.sec.gov/submissions -- SEC's
 *    own official per-CIK filing history API).
 */

const USER_AGENT = 'InsiderSignal research@example.com'; // SEC requires an identifying User-Agent, not a key

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`EDGAR request failed (HTTP ${res.status}): ${url}`);
  return res;
}

/**
 * Latest Form 4 filings right now, deduped by accession number (SEC lists
 * the reporting owner and the issuer as two separate entries per filing).
 * @returns {Promise<Array<{accession:string, indexUrl:string, filedAt:string}>>}
 */
async function fetchCurrentForm4Filings(count = 100) {
  const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&company=&dateb=&owner=include&count=${count}&output=atom`;
  const res = await get(url);
  const xml = await res.text();
  const entries = [...xml.matchAll(/<entry>[\s\S]*?<\/entry>/g)].map(m => m[0]);

  const byAccession = new Map();
  for (const entry of entries) {
    if (!/term="4"/.test(entry)) continue; // exact form-type match only, not "424B2" etc.
    const link = (entry.match(/href="([^"]+)"/) || [])[1];
    const updated = (entry.match(/<updated>([^<]+)<\/updated>/) || [])[1];
    const accMatch = link && link.match(/(\d{10}-\d{2}-\d{6})-index\.htm/);
    if (!link || !accMatch) continue;
    const accession = accMatch[1];
    if (!byAccession.has(accession)) {
      byAccession.set(accession, { accession, indexUrl: link, filedAt: updated });
    }
  }
  return [...byAccession.values()];
}

/** Finds the raw Form 4 XML document URL inside a filing's index page. */
async function findFilingXmlUrl(indexUrl) {
  const res = await get(indexUrl);
  const html = await res.text();
  const links = [...html.matchAll(/href="([^"]+\.xml)"/g)].map(m => m[1]);
  const direct = links.find(l => !l.includes('/xslF345X'));
  if (!direct) throw new Error(`No Form 4 XML found in ${indexUrl}`);
  return direct.startsWith('http') ? direct : `https://www.sec.gov${direct}`;
}

function xmlTag(xml, tag) {
  // Between </value> and the closing tag there is sometimes a <footnoteId/>
  // (confirmed live: real filings attach footnotes to transactionShares) --
  // matching only whitespace there silently dropped the share count on any
  // footnoted transaction. Anything is allowed there now, non-greedily.
  const m = xml.match(new RegExp(`<${tag}>\\s*<value>([\\s\\S]*?)<\\/value>[\\s\\S]*?<\\/${tag}>`));
  return m ? m[1].trim() : null;
}
function xmlSimple(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : null;
}

/** Parses the real structured fields out of a Form 4 XML document. */
async function parseFiling(indexUrl) {
  const xmlUrl = await findFilingXmlUrl(indexUrl);
  const res = await get(xmlUrl);
  const xml = await res.text();

  const isPlanned = xmlSimple(xml, 'aff10b5One') === '1';
  const transactionCode = (xml.match(/<transactionCode>([^<]*)<\/transactionCode>/) || [])[1] || null;

  return {
    issuerName: xmlSimple(xml, 'issuerName'),
    issuerTicker: xmlSimple(xml, 'issuerTradingSymbol'),
    issuerCik: xmlSimple(xml, 'issuerCik'),
    ownerName: xmlSimple(xml, 'rptOwnerName'),
    ownerCik: xmlSimple(xml, 'rptOwnerCik'),
    isDirector: xmlSimple(xml, 'isDirector') === 'true',
    isOfficer: xmlSimple(xml, 'isOfficer') === 'true',
    officerTitle: xmlSimple(xml, 'officerTitle') || null,
    is10b5_1Planned: isPlanned, // true = pre-scheduled, routine; false = discretionary
    transactionCode, // P=open-market buy, S=open-market sell, A=grant, F=tax withholding, M=option exercise
    transactionShares: xmlTag(xml, 'transactionShares'),
    transactionPrice: xmlTag(xml, 'transactionPricePerShare'),
    transactionDate: xmlTag(xml, 'transactionDate'),
    xmlUrl
  };
}

/**
 * Real historical filing pattern for a specific person, from SEC's own
 * official per-CIK submission history -- not estimated, not scraped.
 */
async function fetchHistoricalPattern(ownerCik) {
  const cik = String(ownerCik).padStart(10, '0');
  const res = await get(`https://data.sec.gov/submissions/CIK${cik}.json`);
  const data = await res.json();
  const recent = data.filings.recent;

  const form4Dates = recent.form
    .map((form, i) => (form === '4' ? recent.filingDate[i] : null))
    .filter(Boolean);

  return {
    totalForm4Filings: form4Dates.length,
    mostRecentDates: form4Dates.slice(0, 5),
    firstKnownDate: form4Dates[form4Dates.length - 1] || null
  };
}

/**
 * The last N individual Form 4 filings for a person, as index URLs ready
 * for parseFiling() -- this is the piece fetchHistoricalPattern() doesn't
 * provide (it only returns dates/counts), and the missing link that made
 * the full paid report impossible to generate with one command.
 */
async function fetchRecentForm4IndexUrls(ownerCik, limit = 10) {
  const cik = String(ownerCik).padStart(10, '0');
  const res = await get(`https://data.sec.gov/submissions/CIK${cik}.json`);
  const data = await res.json();
  const recent = data.filings.recent;
  const cikNoLeadingZeros = String(Number(ownerCik));

  const urls = [];
  for (let i = 0; i < recent.form.length && urls.length < limit; i++) {
    if (recent.form[i] !== '4') continue;
    const accession = recent.accessionNumber[i];
    const noDash = accession.replace(/-/g, '');
    urls.push({
      filingDate: recent.filingDate[i],
      indexUrl: `https://www.sec.gov/Archives/edgar/data/${cikNoLeadingZeros}/${noDash}/${accession}-index.htm`
    });
  }
  return urls;
}

module.exports = { fetchCurrentForm4Filings, parseFiling, fetchHistoricalPattern, fetchRecentForm4IndexUrls };
