'use strict';
/**
 * Continuous poller -- checks for new Form 4 filings, processes any not
 * already seen, appends formatted alerts to a dated output file. No
 * distribution channel wired in yet on purpose: this produces real,
 * ready-to-post content today without waiting on a Telegram bot token or
 * any other account setup. Manually post from the output file to start the
 * 30-day kill test now; wire up automated delivery only after real signal.
 */

const fs = require('fs');
const path = require('path');
const { fetchCurrentForm4Filings, parseFiling, fetchHistoricalPattern } = require('./edgar.js');
const { formatAlert } = require('./format-alert.js');

const DATA_DIR = path.join(__dirname, 'data');
const SEEN_PATH = path.join(DATA_DIR, 'seen.json');
const POLL_INTERVAL_MS = 5 * 60 * 1000; // SEC's own feed updates on this rough cadence

function loadSeen() {
  if (!fs.existsSync(SEEN_PATH)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(SEEN_PATH, 'utf8')));
}
function saveSeen(seen) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SEEN_PATH, JSON.stringify([...seen]));
}
function outputPathForToday() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(DATA_DIR, `alerts-${date}.txt`);
}
function appendAlert(text) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(outputPathForToday(), text + '\n\n----------------------------------------\n\n');
}

async function pollOnce() {
  const seen = loadSeen();
  const filings = await fetchCurrentForm4Filings(100);
  const fresh = filings.filter(f => !seen.has(f.accession));

  if (fresh.length === 0) {
    console.log(`[${new Date().toISOString()}] no new filings`);
    return;
  }

  console.log(`[${new Date().toISOString()}] ${fresh.length} new filing(s)`);
  for (const f of fresh) {
    try {
      const parsed = await parseFiling(f.indexUrl);
      const history = await fetchHistoricalPattern(parsed.ownerCik);
      const alert = formatAlert(parsed, history);
      appendAlert(alert);
      console.log(' wrote:', parsed.issuerName, '/', parsed.ownerName);
    } catch (e) {
      console.log(' skipped (parse error):', f.accession, '-', e.message);
    }
    seen.add(f.accession);
  }
  saveSeen(seen);
}

async function main() {
  console.log('insider-signal poller starting. Output:', outputPathForToday());
  await pollOnce();
  setInterval(() => pollOnce().catch(e => console.error('poll error:', e.message)), POLL_INTERVAL_MS);
}

if (require.main === module) main();

module.exports = { pollOnce };
