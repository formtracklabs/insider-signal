'use strict';
/**
 * Turns a parsed filing + its historical pattern into the one thing this
 * asset sells that no competitor bundles into the alert itself: the raw
 * event paired with this specific person's real filing history.
 */

const TXN_LABELS = {
  P: 'Open-market purchase', S: 'Open-market sale', A: 'Grant/award',
  F: 'Tax withholding (shares delivered to cover taxes)', M: 'Option exercise',
  G: 'Gift', C: 'Conversion'
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
