'use strict';
/**
 * Renders the same data generateFullReport() already computed into a real,
 * styled document -- not a prettier dump of the plain-text version. Reuses
 * FormTrack's existing design tokens (formtrack-site/index.html) so the
 * paid report looks like the same product as the landing page, not a
 * different one. No new infrastructure: this produces a single HTML file
 * Ahmad attaches directly, or opens and prints to PDF -- no server, no
 * public exposure, nothing ADR-002 already reasoned against.
 */

const TAG_STYLE = {
  P: 'background:#DCE6DF;color:#2B5D4C;font-weight:600;',
  S: 'background:#F0E1DC;color:#8B3A2B;font-weight:600;',
};
const NEUTRAL_TAG = 'background:#EAEAE2;color:#4A5049;';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Builds an SVG sparkline polyline from whatever real, priced rows exist -- skips gracefully if too few. */
function buildSparkline(rows) {
  const priced = rows
    .filter(r => !r.error && r.transactionPrice && Number(r.transactionPrice) > 0)
    .map(r => ({ date: r.transactionDate || r.filingDate, price: Number(r.transactionPrice) }))
    .filter(r => r.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (priced.length < 2) return null;

  const prices = priced.map(p => p.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const range = max - min || 1;
  const w = 460, h = 70, pad = 8;
  const points = priced.map((p, i) => {
    const x = pad + (i / (priced.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (p.price - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return { points, w, h, first: priced[0], last: priced[priced.length - 1] };
}

/**
 * @param {object} reportResult - the {status:'found', meta} object from generateFullReport()
 * @returns {string} a complete, standalone HTML document
 */
function renderHtmlReport(reportResult) {
  const { meta } = reportResult;
  const { ownerLabel, issuerLabel, verdict, sales, purchases, filingCount, interpretation, tally, categoryLabel, rows } = meta;

  const verdictClass = verdict === 'NET BUYER' ? 'buy' : verdict === 'NET SELLER' ? 'sell' : 'mixed';
  const spark = buildSparkline(rows);

  const summaryChips = Object.entries(tally)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `<span class="chip ${key === 'purchases' || key === 'sales' ? key : ''}">${escapeHtml(categoryLabel[key])}: <b>${count}</b></span>`)
    .join('');

  const tableRows = rows.map(r => {
    if (r.error) {
      return `<tr class="neutral-row"><td>${escapeHtml(r.filingDate || '?')}</td><td colspan="3">Could not parse this filing -- ${escapeHtml(r.error)}</td></tr>`;
    }
    const isKey = r.transactionCode === 'P' || r.transactionCode === 'S';
    const tagStyle = TAG_STYLE[r.transactionCode] || NEUTRAL_TAG;
    const label = r.transactionCode === 'P' ? 'Open-market purchase' : r.transactionCode === 'S' ? 'Open-market sale'
      : (r.transactionCode ? { M: 'Option exercise', X: 'Option exercise', O: 'Option exercise', A: 'Grant/award', F: 'Tax withholding', G: 'Gift' }[r.transactionCode] || r.transactionCode : 'Unknown');
    const shares = r.transactionShares ? Number(r.transactionShares).toLocaleString('en-US') : '--';
    const price = r.transactionPrice && Number(r.transactionPrice) > 0 ? '$' + r.transactionPrice : '--';
    return `<tr class="${isKey ? 'key-row' : 'neutral-row'}">
      <td>${escapeHtml(r.transactionDate || r.filingDate || '?')}</td>
      <td><span class="tag" style="${tagStyle}">${escapeHtml(label)}</span></td>
      <td class="num">${shares}</td>
      <td class="num">${price}</td>
    </tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>FormTrack report -- ${escapeHtml(ownerLabel)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 48px; background: #EAEAE2; color: #1C2321;
    font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 16px; line-height: 1.5;
  }
  .wrap { max-width: 640px; margin: 0 auto; }
  .eyebrow { font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #4A5049; margin: 0 0 8px; }
  h1 { font-family: Georgia, 'Times New Roman', serif; font-size: 30px; margin: 0 0 4px; }
  .issuer { color: #4A5049; margin: 0 0 20px; }
  .verdict-row { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
  .verdict { font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 13px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; padding: 7px 14px; border-radius: 4px; }
  .verdict.buy { background: #DCE6DF; color: #2B5D4C; }
  .verdict.sell { background: #F0E1DC; color: #8B3A2B; }
  .verdict.mixed { background: #EAEAE2; color: #4A5049; border: 1px solid #C9C4B4; }
  .verdict-count { color: #4A5049; font-size: 14px; }
  .interpretation { background: #F4F3EC; border: 1px solid #C9C4B4; border-radius: 4px; padding: 16px 18px; font-size: 15px; margin-bottom: 22px; }
  .spark-box { margin-bottom: 22px; }
  .spark-caption { font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 11px; color: #4A5049; margin-top: 4px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 26px; }
  .chip { font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 12.5px; background: #F4F3EC; border: 1px solid #C9C4B4; border-radius: 4px; padding: 5px 10px; color: #1C2321; }
  .chip.purchases { background: #DCE6DF; border-color: #2B5D4C; color: #2B5D4C; }
  .chip.sales { background: #F0E1DC; border-color: #8B3A2B; color: #8B3A2B; }
  table { width: 100%; border-collapse: collapse; font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 13px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #4A5049; padding: 0 8px 8px 0; border-bottom: 1px solid #C9C4B4; }
  td { padding: 8px 8px 8px 0; border-bottom: 1px dashed #C9C4B4; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .key-row td { font-weight: 600; }
  .neutral-row td { color: #4A5049; }
  .tag { padding: 2px 8px; border-radius: 3px; font-size: 12px; }
  footer { margin-top: 28px; padding-top: 16px; border-top: 1px solid #C9C4B4; font-size: 12.5px; color: #4A5049; }
</style>
</head>
<body>
<div class="wrap">
  <p class="eyebrow">FormTrack full pattern report</p>
  <h1>${escapeHtml(ownerLabel)}</h1>
  <p class="issuer">${escapeHtml(issuerLabel)}</p>

  <div class="verdict-row">
    <span class="verdict ${verdictClass}">${escapeHtml(verdict)}</span>
    <span class="verdict-count">${sales} open-market sale${sales === 1 ? '' : 's'}, ${purchases} purchase${purchases === 1 ? '' : 's'}, out of the last ${filingCount} filings</span>
  </div>

  <div class="interpretation">${escapeHtml(interpretation)}</div>

  ${spark ? `<div class="spark-box">
    <svg width="100%" height="70" viewBox="0 0 ${spark.w} ${spark.h}" preserveAspectRatio="none">
      <polyline points="${spark.points}" fill="none" stroke="${verdictClass === 'sell' ? '#8B3A2B' : '#2B5D4C'}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <p class="spark-caption">Price per share across priced filings, oldest to newest (${spark.first.date} -&gt; ${spark.last.date})</p>
  </div>` : ''}

  <div class="chips">${summaryChips}</div>

  <table>
    <tr><th>Date</th><th>Type</th><th style="text-align:right">Shares</th><th style="text-align:right">Price</th></tr>
    ${tableRows}
  </table>

  <footer>Source: SEC EDGAR (data.sec.gov, sec.gov) -- every row traces to a citable Form 4 filing. FormTrack is not investment advice.</footer>
</div>
</body>
</html>`;
}

module.exports = { renderHtmlReport };
