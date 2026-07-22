# insider-signal

The engine behind [FormTrack](https://formtrack-app.netlify.app): pairs every SEC Form 4 insider filing with that person's real filing history — pulled live from SEC EDGAR, no third-party API, no black-box score.

## Why

Reading insider filings one at a time tells you almost nothing. A single sale could be a scheduled tax event. What matters is the pattern: has this person sold ten times in a row with zero purchases, or is this their first sale in three years? That context lives in SEC's own public filing history — this just pulls it automatically instead of by hand.

## What's here

- `edgar.js` — live Form 4 detection, filing parsing, and per-person historical pattern lookup against SEC's official public endpoints.
- `resolve.js` — resolves a plain company name, ticker, or person's name to a SEC CIK. Handles SEC's `Lastname Firstname` filer-name convention and disambiguates common names instead of guessing.
- `format-alert.js` — turns a parsed filing + its history into a plain-language verdict (net buyer / net seller).
- `lookup-cli.js` — on-demand free-snapshot lookup: `node lookup-cli.js "Clean Harbors"` or `node lookup-cli.js "Alan McKim"` (filing count + dates only).
- `full-report.js` / `report-cli.js` — generates the actual paid report end-to-end from one command: `node report-cli.js "Alan McKim"`. Pulls the last 10 Form 4 filings, parses each one's real transaction detail, and produces a category summary, a deterministic one-line interpretation of the verdict (rule-based, never AI-generated — see `ARCHITECTURAL_DECISIONS.md` ADR-006), and the full ledger. If given a company/ticker with more than one distinct insider filing recently, it asks which specific person is meant instead of mixing unrelated people's transactions into one false "pattern."
- `render-html-report.js` / `html-report-cli.js` — the same report as a real styled document, not plain text: `node html-report-cli.js "Alan McKim"`. Reuses the landing page's exact design system (colors, fonts, sparkline logic); open-market purchase/sale rows render bold and color-tagged while routine compensation rows (grants, exercises, tax) recede, so the pattern is visible at a glance. Saves a self-contained HTML file — attach it directly, or print it to PDF locally. See ADR-007.
- `run.js` — continuous poller for new filings, writes dated output files.

## Data source

Everything here reads from `sec.gov` and `data.sec.gov` directly — SEC's own free, public, official infrastructure. No paid API, no scraping of a third party who could shut it off.

## Usage

```
npm run lookup -- "Clean Harbors"
npm start
```

## Not investment advice

This classifies filing patterns from public records. It doesn't interpret intent, and it isn't a recommendation to buy or sell anything.
