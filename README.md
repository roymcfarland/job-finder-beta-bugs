# Atlas Beta Bug Reporter

> Authenticated bug-report inbox for the Atlas beta program. Verified beta users submit bugs that route directly to triage. Deliberately framework-free.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Live](https://img.shields.io/badge/live-brightlinebugs.com-brightgreen)](https://brightlinebugs.com)

## What this is

This is the public infrastructure half of a deliberate pattern: ship the product private, ship the infrastructure around it public.

[Atlas](https://jobfinder.guru) is a private commercial AI-powered job search agent. **Atlas Beta Bug Reporter** is its public companion — the authenticated submission inbox where verified beta users report bugs, regressions, and behavior they want changed. Reports route to a triage queue for review and disposition.

The interesting choice in this repo is what it doesn't have: no React, no Next.js, no UI framework. Just Node, Postgres, server-rendered HTML templates, and session cookies. The submission flow is fast, the surface area is small, and the whole thing is auditable in an afternoon. It is a working example of "lightweight and fit-for-purpose" applied to a problem where most teams would reach for a framework by reflex.

## Features

- Email + magic-link authentication for beta participants
- Role-based routes (submitter, triager, admin)
- Structured bug submission with severity, category, reproduction steps, and environment
- Vercel Cron–driven housekeeping (digest emails, stale-report sweeps)
- Resend-backed transactional email
- Postgres-backed audit log of every status transition
- Plain HTML templates — no client-side framework, no build step for the UI

## Stack

- **Runtime:** Node.js 20+
- **Database:** Postgres
- **Email:** [Resend](https://resend.com)
- **Cron:** [Vercel Cron](https://vercel.com/docs/cron-jobs)
- **Auth:** session cookies + magic-link tokens
- **UI:** server-rendered HTML templates (zero frontend framework — deliberate)
- **Hosting:** [Vercel](https://vercel.com)

## Why no framework

The submission surface is roughly five pages and four endpoints. A framework would have meant a build step, a hydration model, and a bundle for users who are reporting a bug and leaving. Instead the entire UI is HTML rendered on the server with a small templating helper. New developers can read the whole UI layer in one sitting.

This is the engineering decision the repo is meant to demonstrate: choose the smallest tool that handles the actual workload.

## Quick start

```bash
git clone https://github.com/roymcfarland/atlas-beta-bug-reporter.git
cd atlas-beta-bug-reporter
npm install
cp .env.example .env   # fill in DATABASE_URL, RESEND_API_KEY, SESSION_SECRET, etc.
npm run db:migrate
npm run dev
```

See `.env.example` for the full list of required environment variables.

## Project structure

```
.
├── src/
│   ├── routes/         # request handlers grouped by role
│   ├── views/          # HTML templates
│   ├── db/             # Postgres schema + queries
│   ├── auth/           # magic-link + session logic
│   └── jobs/           # Vercel Cron handlers
├── migrations/         # SQL migrations
└── public/             # static assets
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
