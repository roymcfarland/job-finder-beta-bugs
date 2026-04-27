# JobFinder.guru Beta Bugs

Small Node app for authenticated beta bug reporting.

It now includes:

- Email/password accounts for beta testers
- Password reset by email
- Admin accounts with user disable/enable controls
- An admin comment dashboard with resolve/reopen toggles and filters
- A public landing page with login, sign-up, and reset flows
- A protected bug-report dashboard behind session cookies
- Open Graph and Twitter card previews for polished link sharing
- Postgres-backed storage for users, sessions, reset tokens, and bug reports
- Optional bug-report notifications through Resend or a webhook

## Quick start

1. Copy `.env.example` to `.env`
2. Install dependencies with `npm install`
3. Configure:
   - Postgres: `DATABASE_URL` locally, or let Vercel inject a Postgres connection variable in production
   - Resend for password resets: `RESEND_API_KEY` and `EMAIL_FROM`
   - Admin bootstrap: `ADMIN_EMAILS` with your own email address
   - Optional bug report notifications: `BUG_REPORT_NOTIFICATION_TO_EMAIL` or `REPORT_WEBHOOK_URL`
4. Run `npm start`
5. Open [http://127.0.0.1:3000](http://127.0.0.1:3000)

The app auto-loads `.env` and `.env.local` in local development.

## Scripts

- `npm start` starts the production-style Node server
- `npm run dev` starts the app with `node --watch`
- `npm test` runs the built-in Node tests

## Environment variables

Required for the full production flow:

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `APP_BASE_URL`
- `ADMIN_EMAILS`

Database configuration:

- `DATABASE_URL` for local or generic Postgres hosting
- Vercel storage integrations may inject `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, or related variables, and the app will use them automatically

Optional:

- `BUG_REPORT_NOTIFICATION_TO_EMAIL`
- `REPORT_WEBHOOK_URL`
- `REPORT_WEBHOOK_TOKEN`
- `ALLOWED_ORIGIN` if your frontend and API are on different origins

## Admin behavior

- Any account whose email appears in `ADMIN_EMAILS` is treated as an admin account.
- Admins can disable or re-enable user accounts.
- Disabled users lose active sessions immediately and cannot sign in again until re-enabled.
- Admins can filter user comments by reporter and by resolved/unresolved state.
- Comment resolution is a live toggle, so resolved comments can be reopened without reloading the page.
- Disable/enable and resolve/reopen actions are recorded in the `admin_audit_log` table and exposed via `GET /api/admin/audit-log`.

## Deployment

### Plain Node host

- Set the environment variables from `.env.example`
- Use `npm start`
- Point a domain or subdomain at the service

### Vercel

- Import the repo into Vercel
- Attach a Postgres integration or set `DATABASE_URL` manually
- Add `RESEND_API_KEY`, `EMAIL_FROM`, and `APP_BASE_URL`
- Deploy

`APP_BASE_URL` is also used for canonical URLs and social preview images, so set
it to the public production origin before sharing links.

## Notes

- Password reset requires a working Resend configuration in production.
- Bug reports are stored in Postgres first, so missing notification settings no longer block report submission.
- File uploads are intentionally omitted to keep the app lightweight and easy to deploy.
