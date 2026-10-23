# Atlas Beta Bug Reporter

> Authenticated bug-report inbox for the Atlas beta program. Invited testers submit bugs for admin review. Deliberately framework-free.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Live](https://img.shields.io/badge/live-brightlinebugs.com-brightgreen)](https://brightlinebugs.com)

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
- Postgres-backed `admin_audit_log` for admin actions: enabling/disabling users and resolving/reopening reports
- Plain HTML templates — no client-side framework, no build step for the UI

## Stack

| Component | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Database | Postgres |
| Email | [Resend](https://resend.com) |
| Cron | [Vercel Cron](https://vercel.com/docs/cron-jobs) |
| Auth | Passwords + session cookies; invite-code-gated registration |
| UI | Server-rendered HTML templates (zero frontend framework — deliberate) |
| Hosting | [Vercel](https://vercel.com) |

## Why no framework

The app serves four HTML pages: sign-in/registration, password reset, the tester dashboard, and the admin dashboard. The UI uses server-rendered templates and small JavaScript modules, with no frontend build step or hydration layer. Page routing and API dispatch live in `src/app.js`.

This is the engineering decision the repo is meant to demonstrate: choose the smallest tool that handles the actual workload.

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

Set `REGISTRATION_INVITE_CODE` to a shared code distributed by the Atlas beta team. Generate one with `openssl rand -hex 16`. Non-admin registration requires that code whenever it is configured. If it is unset or blank, registration stays open outside production and is closed in production. Emails listed in `ADMIN_EMAILS` can register without a code, including when production registration is closed. Existing users can still log in.

For production, set `REGISTRATION_INVITE_CODE`, configure the database and email variables, and set `CRON_SECRET` to protect `/api/cron/cleanup`. That is the only scheduled job in `vercel.json`; it runs daily at 03:17 UTC and deletes expired sessions plus expired reset tokens or tokens used more than seven days ago. See `.env.example` for configuration options.

Run `npm test` for the full test suite, as CI does. Run `npm run cleanup` for manual session and reset-token cleanup.

## Project structure

```
.
├── .env.example
├── .github/
│   └── workflows/
│       └── ci.yml
├── .gitignore
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
