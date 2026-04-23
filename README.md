# JobFinder.guru Beta Bug Reports

Small, dependency-light bug intake app for JobFinder.guru beta users.

It gives you:

- A clean standalone form beta users can fill out in under two minutes
- Structured reports with reproduction steps, severity, and page context
- Spam protection via a honeypot and minimum form-fill time
- In-memory rate limiting to reduce endpoint abuse
- Flexible delivery through Resend email, a generic webhook, or local file logging
- Two deployment paths: plain Node hosting or Vercel

## Quick start

1. Copy `.env.example` to `.env`
2. Configure one delivery mode:
   - Resend email: `RESEND_API_KEY`, `BUG_REPORT_TO_EMAIL`, `BUG_REPORT_FROM_EMAIL`
   - Webhook: `REPORT_WEBHOOK_URL` and optional `REPORT_WEBHOOK_TOKEN`
   - Local file: `REPORT_LOG_PATH=./data/reports.ndjson`
3. Run `npm start`
4. Open [http://localhost:3000](http://localhost:3000)

Local development defaults to `HOST=127.0.0.1`. For public container hosts, set
`HOST=0.0.0.0`.

## Scripts

- `npm start` starts the production-style Node server
- `npm run dev` starts the app with `node --watch`
- `npm test` runs the built-in Node tests

## Deployment

### Option 1: plain Node host

This is the simplest path for Railway, Render, Fly.io, a VPS, or any container host:

- Set the same environment variables from `.env.example`
- Use `npm start` as the start command
- Point your domain or subdomain to the deployed service

### Option 2: Vercel

The repo also includes `api/report.js`, so Vercel can serve the static frontend from `public/` and the API from `/api/report`.

- Import the repo into Vercel
- Add the same environment variables
- Deploy

## Delivery modes

### Resend email

Recommended if you want bug reports sent directly to your inbox.

Required environment variables:

- `RESEND_API_KEY`
- `BUG_REPORT_TO_EMAIL`
- `BUG_REPORT_FROM_EMAIL`

### Generic webhook

Recommended if you want to send reports to Slack, Make, Zapier, a custom API, or a queue.

Required environment variables:

- `REPORT_WEBHOOK_URL`
- `REPORT_WEBHOOK_TOKEN` is optional

The webhook receives the full structured JSON report body.

### Local file logging

Useful for local development or self-hosting.

- `REPORT_LOG_PATH=./data/reports.ndjson`

Each submitted report is appended as a single JSON line.

## Notes

- File uploads are intentionally omitted to keep deployment and hosting simple.
- The form accepts links to screenshots, Loom videos, or console dumps instead.
- In production, the app returns `503` until a real delivery mode is configured.
