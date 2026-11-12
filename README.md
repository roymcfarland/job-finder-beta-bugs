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
- Structured bug submission with severity, category, reproduction steps, and affected URL
- Vercel Cron cleanup of expired sessions and expired or used password reset tokens
- Resend-backed password reset emails and optional report notifications by email or webhook
- Row Level Security enabled on all application tables when the schema is created or migrated
- Postgres-backed `admin_audit_log` for admin actions: enabling/disabling users and resolving/reopening reports
- Plain HTML templates — no client-side framework, no build step for the UI

## Stack

| Component | Technology |
|---|---|
| Runtime | Node.js 24 required |
| Database | Postgres |
| Email | [Resend](https://resend.com) |
| Cron | [Vercel Cron](https://vercel.com/docs/cron-jobs) |
| Auth | Passwords + session cookies; invite-code-gated registration |
| UI | Server-rendered HTML templates (zero frontend framework — deliberate) |
| Hosting | [Vercel](https://vercel.com) |

## Why no framework

The app serves four HTML pages: sign-in/registration, password reset, the tester dashboard, and the admin dashboard. The UI uses server-rendered templates and small JavaScript modules, with no frontend build step or hydration layer. Page routing and API dispatch live in `src/app.js`.

This is the engineering decision the repo is meant to demonstrate: choose the smallest tool that handles the actual workload.

## Security and caching notes

- `vercel.json` sets a strict Content-Security-Policy (no inline scripts or styles), HSTS, `X-Frame-Options: DENY`, and related headers on every response.
- On Vercel, files in `public/` are served by the platform with `max-age=0, must-revalidate` and an ETag, so deploys reach visitors immediately. `src/app.js` sends the same header when serving assets itself locally.
- Registration is gated by a shared invite code from the environment, not by the admin dashboard; rotate it by changing `REGISTRATION_INVITE_CODE` and redeploying.

## Quick start

```bash
git clone https://github.com/roymcfarland/job-finder-beta-bugs.git
cd job-finder-beta-bugs
npm ci
cp .env.example .env   # configure DATABASE_URL for a running Postgres instance
npm run migrate
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Set `ADMIN_EMAILS` to the email addresses that should receive admin access. Set `RESEND_API_KEY` and `EMAIL_FROM` for password reset email delivery; without them, development logs the reset link locally.

Use a comma-separated list for `ADMIN_EMAILS`. With a nonempty list, roles are synchronized at login and session refresh. An empty list leaves existing roles as stored.

Set `REGISTRATION_INVITE_CODE` to a shared code distributed by the Atlas beta team. Generate one with `openssl rand -hex 16`. Non-admin registration requires that code whenever it is configured. If it is unset or blank, registration stays open outside production and is closed in production. Emails listed in `ADMIN_EMAILS` can register without a code, including when production registration is closed. Existing users can still log in.

For production, set `REGISTRATION_INVITE_CODE`, configure the database and email variables, and set `CRON_SECRET` to protect `/api/cron/cleanup`. That is the only scheduled job in `vercel.json`; it runs daily at 03:17 UTC and deletes expired sessions plus expired reset tokens or tokens used more than seven days ago. See `.env.example` for configuration options.

Run `npm test` for the full test suite, as CI does. Run `npm run cleanup` for manual session and reset-token cleanup.

## Continuous integration and dependencies

[CI](.github/workflows/ci.yml) runs on pushes to `main`, on pull requests, and on manual dispatch. The test matrix runs Node.js 24 on `ubuntu-latest`, with a 10-minute timeout per job and `fail-fast: false`. Each job runs `npm ci`, then `npm audit --omit=dev --audit-level=high`, then `npm test`. High or critical production dependency advisories fail the audit step and the job.

[`package.json`](package.json) requires Node.js 24 via `engines.node` set to `24.x`, and [`.nvmrc`](.nvmrc) pins Node.js 24 for local development. [Dependabot](.github/dependabot.yml) opens monthly grouped update PRs for npm and GitHub Actions, with up to three open PRs per ecosystem.

Scheduled GitHub Actions triggers are intentionally disallowed. [`tests/githubActionsPolicy.test.js`](tests/githubActionsPolicy.test.js) fails if a workflow adds a `schedule:` or `cron:` key. The [Vercel Cron cleanup job](vercel.json) is the repo's only scheduled job.

## Additional environment variables

These settings supplement the variables in [Quick start](#quick-start).

| Variable | Purpose |
|---|---|
| `ADMIN_RATE_LIMIT_MAX` | Maximum admin API requests per IP within the admin rate limit window. |
| `ADMIN_RATE_LIMIT_WINDOW_MS` | Admin API rate limit window in milliseconds. |
| `ALLOWED_ORIGIN` | Origin allowed for credentialed API requests and accepted by the auth origin check. |
| `APP_BASE_URL` | Explicit public base URL used for password reset links, social metadata, and auth origin checks. |
| `APP_NAME` | Display name used in email and social metadata. |
| `AUTH_FROM_EMAIL` | Preferred Resend sender address, ahead of `EMAIL_FROM`. |
| `AUTH_RATE_LIMIT_MAX` | Maximum rate-limited authentication requests per IP within the auth rate limit window. It also sets the basis for the per-account login limit. |
| `AUTH_RATE_LIMIT_WINDOW_MS` | Auth rate limit window in milliseconds for both IP and per-account limits. |
| `BUG_REPORT_FROM_EMAIL` | Resend sender fallback after `AUTH_FROM_EMAIL` and `EMAIL_FROM`. |
| `BUG_REPORT_NOTIFICATION_TO_EMAIL` | Recipient address for bug report notification emails. |
| `BUG_REPORT_TO_EMAIL` | Fallback recipient address for bug report notification emails. |
| `DATABASE_SSL_CA` | CA certificate supplied for remote Postgres TLS connections. |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | Controls certificate verification for remote Postgres TLS connections. |
| `HOST` | Server bind address and host for the base URL fallback. |
| `NODE_ENV` | Application environment. Production mode changes registration, cookie, and email behavior. |
| `PASSWORD_MIN_LENGTH` | Minimum accepted password length. |
| `PASSWORD_RESET_TTL_MS` | Password reset token lifetime in milliseconds. |
| `PORT` | Server listen port and port for the base URL fallback. |
| `POSTGRES_URL` | First Postgres connection URL fallback after `DATABASE_URL`. |
| `POSTGRES_PRISMA_URL` | Postgres connection URL fallback after `POSTGRES_URL`. |
| `POSTGRES_URL_NON_POOLING` | Postgres connection URL fallback after `POSTGRES_PRISMA_URL`. |
| `PUBLIC_VERCEL_URL` | First public URL fallback when `APP_BASE_URL` is unset. |
| `RATE_LIMIT_MAX` | Maximum bug report submission requests per IP within the report rate limit window. |
| `RATE_LIMIT_WINDOW_MS` | Bug report submission rate limit window in milliseconds. |
| `REPORT_WEBHOOK_TOKEN` | Optional bearer token sent to the bug report notification webhook. |
| `REPORT_WEBHOOK_URL` | Destination for bug report notifications. When configured, the webhook takes precedence over email. |
| `SESSION_COOKIE_NAME` | Overrides the default session cookie name. |
| `SESSION_COOKIE_SECURE` | Controls the Secure flag on session cookies in production. It defaults to enabled. |
| `SESSION_TTL_MS` | Session lifetime in milliseconds. |
| `TRUST_PROXY` | Controls whether client IP detection trusts proxy headers. It defaults to enabled when Vercel is detected. |
| `VERCEL` | Platform marker used to detect Vercel for the default proxy trust setting. |
| `VERCEL_ENV` | Platform environment marker also used to detect Vercel for the default proxy trust setting. |
| `VERCEL_PROJECT_PRODUCTION_URL` | Public URL fallback after `PUBLIC_VERCEL_URL`. Its presence also signals Vercel. |
| `VERCEL_URL` | Public URL fallback after `VERCEL_PROJECT_PRODUCTION_URL`. Its presence also signals Vercel. |

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
