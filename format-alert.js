'use strict';
/**
 * Turns a parsed filing + its historical pattern into the one thing this
 * asset sells that no competitor bundles into the alert itself: the raw
 * event paired with this specific person's real filing history.
 */

// Complete official SEC Form 4 transaction code table (General Instructions,
// Table I col. 3 / Table II col. 4) -- found incomplete live: code "D"
// (real filing, Musk/SPCX) printed as a raw letter instead of a label.
// Cross-verified against the Federal Reserve's mirrored copy of the SEC's
// own Form 4 instructions plus multiple independent compliance references.
const TXN_LABELS = {
  P: 'Open-market purchase', S: 'Open-market sale', V: 'Voluntarily reported early',
  A: 'Grant/award', D: 'Disposition back to the issuer',
  F: 'Tax withholding (shares delivered to cover taxes)', I: 'Discretionary transaction (broker-directed)',
  M: 'Option exercise', C: 'Conversion', E: 'Expiration of short derivative position',
  H: 'Expiration of long derivative position', O: 'Exercise (out-of-the-money derivative)',
  X: 'Exercise (in-the-money/at-the-money derivative)', G: 'Gift', L: 'Small acquisition',
  W: 'Acquired/disposed by will or inheritance', Z: 'Voting trust deposit/withdrawal',
  J: 'Other (see filing footnotes)', K: 'Equity swap or similar instrument',
  U: 'Disposition via change-of-control tender'
};

function formatAlert(filing, history) {
  const value = filing.transactionShares && filing.transactionPrice
    ? (Number(filing.transactionShares) * Number(filing.transactionPrice)).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    : 'n/a';

  const role = [filing.isDirector && 'Director', filing.isOfficer && (filing.officerTitle || 'Officer')].filter(Boolean).join(', ') || 'Other';
  const txnLabel = TXN_LABELS[filing.transactionCode] || filing.transactionCode || 'Unknown';
  const planned = filing.is10b5_1Planned ? 'Pre-scheduled (Rule 10b5-1 plan)' : 'Discretionary (not pre-scheduled)';

  const lines = [
    `${filing.issuerName} (${filing.issuerTicker || '?'}) -- Form 4`,
    `${filing.ownerName} | ${role}`,
    `${txnLabel} | ${filing.transactionShares || '?'} shares @ $${filing.transactionPrice || '?'} = ${value}`,
    `${planned} | Filed for transaction date ${filing.transactionDate}`,
    '',
    `History: ${history.totalForm4Filings} Form 4 filing(s) on record for this person` +
      (history.firstKnownDate ? `, earliest ${history.firstKnownDate}` : '') +
      (history.mostRecentDates.length > 1 ? `. Recent: ${history.mostRecentDates.slice(1, 4).join(', ')}` : ' -- this is their first on record.'),
    '',
    `Source: ${filing.xmlUrl}`
  ];
  return lines.join('\n');
}

module.exports = { formatAlert, TXN_LABELS };
