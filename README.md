# Atlas Beta Bug Reporter

> Authenticated bug-report inbox for the Atlas beta program. Invited testers submit bugs for admin review. Deliberately framework-free.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Live](https://img.shields.io/badge/live-brightlinebugs.com-brightgreen)](https://brightlinebugs.com)

> **Not affiliated with Brightline, the Florida train service.** This is the bug reporter for Atlas (Jobfinder.guru) beta testers only. It cannot take reports about train tickets, bookings, or Brightline's app.

## What this is

This is the public infrastructure half of a deliberate pattern: ship the product private, ship the infrastructure around it public.

[Atlas](https://jobfinder.guru) is an AI-powered job search agent. **Atlas Beta Bug Reporter** is its public companion — the authenticated submission inbox where testers with an invite code report bugs, regressions, and behavior they want changed. Reports are stored in Postgres for review in the admin dashboard.

The interesting choice in this repo is what it doesn't have: no React, no Next.js, no UI framework. Just Node, Postgres, server-rendered HTML templates, and session cookies. Plain browser JavaScript handles form submissions and dashboard updates.

## Features

- Email and password authentication with session cookies and password reset links
- Shared invite-code gate for registration; configured admin emails can bypass it
- Two roles: `user` for submitting and viewing their own reports, and `admin` for reviewing reports, resolving/reopening them, and enabling/disabling users
- Structured bug submission with severity, category, reproduction steps, and an optional affected URL
- Vercel Cron cleanup of expired sessions and password reset tokens that have expired or were used more than seven days ago
- Resend-backed password reset emails and optional report notifications by email or webhook
- Row Level Security enabled on all application tables when the schema is created or migrated
- Postgres-backed `admin_audit_log` for admin actions: enabling/disabling users and resolving/reopening reports
- Plain HTML templates — no client-side framework, no build step for the UI

## Stack

| Component | Technology |
|---|---|
| Runtime | Node.js (see [Quick start](#quick-start)) |
| Database | Postgres via [`pg`](package.json) 8 |
| Email | [Resend](https://resend.com) |
| Cron | [Vercel Cron](https://vercel.com/docs/cron-jobs) |
| Auth | Passwords + session cookies; invite-code-gated registration |
| UI | Server-rendered HTML templates (zero frontend framework — deliberate) |
| Hosting | [Vercel](https://vercel.com) |

## Why no framework

The app serves four HTML pages: sign-in/registration, password reset, the tester dashboard, and the admin dashboard. The UI uses server-rendered templates and small JavaScript modules, with no frontend build step or hydration layer. Page routing and API dispatch live in `src/app.js`.

This is the engineering decision the repo is meant to demonstrate: choose the smallest tool that handles the actual workload.

## Quick start

Use Node.js 24 as specified in [`package.json`](package.json) and [`.nvmrc`](.nvmrc). Use the npm bundled with that Node installation. Run the database-backed app against a local Postgres instance with a database role that can create and alter its tables.

```bash
git clone https://github.com/roymcfarland/job-finder-beta-bugs.git
cd job-finder-beta-bugs
npm ci
```

Use `.env.example` as the template for a local `.env` file and configure `DATABASE_URL`. The app also reads `.env.local`, which takes precedence over `.env`. Variables already set in the shell take precedence over both files.

```bash
npm run migrate
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Use `npm start` to run the server without watch mode. The app serves the templates and browser JavaScript directly, so there is no build command.

Run `npm test` for the full suite. It uses Node's built-in test runner and runs without a database or service credentials. Use `npm run cleanup` for manual session and reset-token cleanup against the configured database.

### Registration and admin access

Set `REGISTRATION_INVITE_CODE` to a shared code distributed by the Atlas beta team. Generate one with `openssl rand -hex 16`. When configured, the code is required for non-admin registration. With the variable unset or blank, registration is open outside production and closed in production. Emails listed in `ADMIN_EMAILS` can register without a code. Existing users can still log in.

`ADMIN_EMAILS` accepts a comma-separated list. With a nonempty list, roles are synchronized at login and session refresh. An empty list leaves existing roles as stored. Rotate the invite code by changing `REGISTRATION_INVITE_CODE` in the environment and redeploying.

### Environment variables

| Variable | Purpose | Required? | Where set |
|---|---|---|---|
| `DATABASE_URL` | Primary Postgres connection URL. | One of the four database URLs is required for database operations. | Local / Vercel |
| `POSTGRES_URL` | First Postgres connection URL fallback after `DATABASE_URL`. | Database URL alternative | Local / Vercel |
| `POSTGRES_PRISMA_URL` | Postgres connection URL fallback after `POSTGRES_URL`. | Database URL alternative | Local / Vercel |
| `POSTGRES_URL_NON_POOLING` | Postgres connection URL fallback after `POSTGRES_PRISMA_URL`. | Database URL alternative | Local / Vercel |
| `ADMIN_EMAILS` | Email addresses that receive admin access and can bypass the registration gate. | To assign admin roles | Local / Vercel |
| `REGISTRATION_INVITE_CODE` | Shared code for non-admin registration. | For non-admin signup in production | Local / Vercel |
| `CRON_SECRET` | Authenticates cleanup requests to `/api/cron/cleanup`. | For the cleanup endpoint | Local / Vercel |
| `RESEND_API_KEY` | Authenticates password reset and report notification email requests to Resend. | For email delivery | Local / Vercel |
| `AUTH_FROM_EMAIL` | Preferred Resend sender address. | One of the three sender addresses is required for email delivery. | Local / Vercel |
| `EMAIL_FROM` | Resend sender fallback after `AUTH_FROM_EMAIL`. | Sender address alternative | Local / Vercel |
| `BUG_REPORT_FROM_EMAIL` | Resend sender fallback after `AUTH_FROM_EMAIL` and `EMAIL_FROM`. | Sender address alternative | Local / Vercel |
| `ADMIN_RATE_LIMIT_MAX` | Maximum admin API requests per IP within the admin rate limit window. | Optional | Local / Vercel |
| `ADMIN_RATE_LIMIT_WINDOW_MS` | Admin API rate limit window in milliseconds. | Optional | Local / Vercel |
| `ALLOWED_ORIGIN` | Origin allowed for credentialed API requests and accepted by the auth origin check. | Optional | Local / Vercel |
| `APP_BASE_URL` | Explicit public base URL used for password reset links, social metadata, and auth origin checks. | Optional | Local / Vercel |
| `APP_NAME` | Display name used in email and social metadata. | Optional | Local / Vercel |
| `AUTH_RATE_LIMIT_MAX` | Maximum rate-limited authentication requests per IP within the auth rate limit window. It also sets the basis for the per-account login limit. | Optional | Local / Vercel |
| `AUTH_RATE_LIMIT_WINDOW_MS` | Auth rate limit window in milliseconds for both IP and per-account limits. | Optional | Local / Vercel |
| `BUG_REPORT_NOTIFICATION_TO_EMAIL` | Recipient address for bug report notification emails. | One recipient address is required for report email notifications. | Local / Vercel |
| `BUG_REPORT_TO_EMAIL` | Fallback recipient address for bug report notification emails. | Recipient address alternative | Local / Vercel |
| `DATABASE_SSL_CA` | CA certificate supplied for remote Postgres TLS connections. | Optional | Local / Vercel |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | Controls certificate verification for remote Postgres TLS connections. | Optional | Local / Vercel |
| `HOST` | Server bind address and host for the base URL fallback. | Optional | Local / Vercel |
| `NODE_ENV` | Application environment. Production mode changes registration, cookie, and email behavior. | Optional | Local / Vercel runtime |
| `PASSWORD_MIN_LENGTH` | Minimum accepted password length. | Optional | Local / Vercel |
| `PASSWORD_RESET_TTL_MS` | Password reset token lifetime in milliseconds. | Optional | Local / Vercel |
| `PORT` | Server listen port and port for the base URL fallback. | Optional | Local / Vercel |
| `PUBLIC_VERCEL_URL` | First public URL fallback when `APP_BASE_URL` is unset. | Optional | Local / Vercel |
| `RATE_LIMIT_MAX` | Maximum bug report submission requests per IP within the report rate limit window. | Optional | Local / Vercel |
| `RATE_LIMIT_WINDOW_MS` | Bug report submission rate limit window in milliseconds. | Optional | Local / Vercel |
| `REPORT_WEBHOOK_TOKEN` | Optional bearer token sent to the bug report notification webhook. | Optional | Local / Vercel |
| `REPORT_WEBHOOK_URL` | Destination for bug report notifications. When configured, the webhook takes precedence over email. | For webhook notifications | Local / Vercel |
| `SESSION_COOKIE_NAME` | Overrides the default session cookie name. | Optional | Local / Vercel |
| `SESSION_COOKIE_SECURE` | Controls the Secure flag on session cookies in production. It defaults to enabled. | Optional | Local / Vercel |
| `SESSION_TTL_MS` | Session lifetime in milliseconds. | Optional | Local / Vercel |
| `TRUST_PROXY` | Controls whether client IP detection trusts proxy headers. It defaults to enabled when Vercel is detected. | Optional | Local / Vercel |
| `VERCEL` | Platform marker used to detect Vercel for the default proxy trust setting. | Optional | Vercel system |
| `VERCEL_ENV` | Platform environment marker also used to detect Vercel for the default proxy trust setting. | Optional | Vercel system |
| `VERCEL_PROJECT_PRODUCTION_URL` | Public URL fallback after `PUBLIC_VERCEL_URL`. Its presence also signals Vercel. | Optional | Vercel system |
| `VERCEL_URL` | Public URL fallback after `VERCEL_PROJECT_PRODUCTION_URL`. Its presence also signals Vercel. | Optional | Vercel system |

Without a Resend key and sender address, development logs the password reset link locally. Production requires both for password reset email delivery.

## Deployment

Vercel's GitHub integration creates preview deployments for pull requests and production deployments from `main`. The preview provides a hosted URL for review. Database-backed preview flows require a database URL in the Preview environment. Set `APP_BASE_URL` to the preview origin so password reset links and auth origin checks use that host. The fallback in [`src/config.js`](src/config.js) prefers the production hostname over the deployment hostname when both are present.

For production, configure the database and email settings, set `REGISTRATION_INVITE_CODE` for tester signup, and set `CRON_SECRET` to enable authenticated cleanup. [`vercel.json`](vercel.json) defines one Vercel Cron job. It calls `/api/cron/cleanup` daily at 03:17 UTC to delete expired sessions and reset tokens that have expired or were used more than seven days ago.

## Security and automation

- [`vercel.json`](vercel.json) sets security headers across Vercel routes, including a Content Security Policy that blocks inline scripts and styles, HSTS, and `X-Frame-Options: DENY`.
- As verified on 2026-11-16, Vercel serves static assets in `public/` with `cache-control: public, max-age=0, must-revalidate` and an ETag, so caches revalidate before reusing an asset on each request. Vercel serves HTML pages with `cache-control: no-store`. [`src/app.js`](src/app.js) sends the same cache-control header for assets it serves locally.
- [CI](.github/workflows/ci.yml) runs on pushes to `main`, pull requests, and manual dispatch. The test matrix uses the Node major in Quick start on `ubuntu-latest`, with a 10-minute timeout and `fail-fast: false`. It runs `npm ci`, `npm audit --omit=dev --audit-level=high`, and `npm test`. High or critical production dependency advisories fail the audit and the job. Branch protection requires the Node test check and an up-to-date PR branch before merging.
- [Dependabot](.github/dependabot.yml) groups npm and GitHub Actions updates monthly, with up to three open update PRs per ecosystem.
- [The workflow policy test](tests/githubActionsPolicy.test.js) disallows scheduled Actions triggers using the `schedule` or `cron` keys. Vercel Cron handles the application's scheduled cleanup.
- See [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## Contributing

Open a pull request to `main` for each change and include any related documentation updates in the same PR. Delete the branch after merge. When finished with a scratch checkout, use `git worktree remove` with its path.

The entry point is [`server.js`](server.js), page and API routing are in [`src/app.js`](src/app.js), and the schema and migration code is in [`src/db.js`](src/db.js).

## Project structure

```
.
├── .env.example
├── .github/
│   ├── dependabot.yml
│   └── workflows/
│       └── ci.yml
├── .gitignore
├── .nvmrc
├── LICENSE
├── README.md
├── SECURITY.md
├── package-lock.json
├── package.json
├── public/
│   ├── admin.js
│   ├── dashboard.js
│   ├── dom.js
│   ├── landing.js
│   ├── og-image.png
│   ├── og-image.svg
│   ├── reset-password.js
│   └── styles.css
├── scripts/
│   ├── cleanup.js
│   └── migrate.js
├── server.js
├── src/
│   ├── adminApi.js
│   ├── adminService.js
│   ├── apiSession.js
│   ├── app.js
│   ├── authApi.js
│   ├── authService.js
│   ├── bugReportApi.js
│   ├── bugReportSchema.js
│   ├── bugReportService.js
│   ├── config.js
│   ├── cronApi.js
│   ├── db.js
│   ├── http.js
│   ├── loadEnv.js
│   ├── logger.js
│   ├── notifications.js
│   ├── passwords.js
│   ├── rateLimitStore.js
│   ├── socialMeta.js
│   ├── tokens.js
│   └── uuid.js
├── templates/
│   ├── admin.html
│   ├── dashboard.html
│   ├── landing.html
│   └── reset-password.html
├── tests/
│   ├── adminApi.test.js
│   ├── authApi.test.js
│   ├── bugReportApi.test.js
│   ├── bugReportSchema.test.js
│   ├── config.test.js
│   ├── cronApi.test.js
│   ├── db.test.js
│   ├── githubActionsPolicy.test.js
│   ├── http.test.js
│   ├── passwords.test.js
│   └── socialMeta.test.js
└── vercel.json
```

## Where this fits

| Role | Project |
|---|---|
| Product (private) | [Atlas](https://jobfinder.guru) |
| **Beta infrastructure (this repo)** | **Atlas Beta Bug Reporter — [brightlinebugs.com](https://brightlinebugs.com)** |
| Author's GitHub profile | [github.com/roymcfarland](https://github.com/roymcfarland) |

## License

[MIT](LICENSE). Use it, fork it, learn from it. If it helps you ship something smaller, that is the point.

## Author

Roy McFarland — [brightline.io](https://brightline.io) · [roy@brightline.io](mailto:roy@brightline.io)
