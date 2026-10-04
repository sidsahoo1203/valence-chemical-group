# Valence Chemical Group

B2B chemical procurement with React 19/Vite, Express 5, MongoDB Atlas, shared Zod/domain logic, Stripe payment confirmation and Cloudinary documents. The retained private Cloudflare demo uses the shared API with D1/R2; the Express application always uses your configured MongoDB.

## What changed

- Admin tabs remount safely; loading state cannot display another route's stale records; history fields are defensive.
- Session refresh has a separate per-session quota. Strict login/register/reset IP limits, login email limits, CSRF/origin checks, role/ownership checks and Stripe verification remain enforced.
- The Express adapter strips client IP claims and passes trusted `req.ip`; localhost trusts zero proxy hops, Render's direct ingress one.
- Web Locks serialize cookie-changing auth calls across tabs. BroadcastChannel syncs session changes without sharing or persisting tokens. Reload and logout work across tabs; a temporary refresh failure offers retry instead of falsely logging out.
- Staff use their real seeded email/password at `/login` and go to `/admin`. Admin demo UI/API access and the public Staff portal link are removed; Buyer demo remains available only in the private demo.
- Guest and buyer RFQs reach the same staff queue, with full detail, attachments and review/quote/decline actions. Guest follow-up uses the supplied contact details; there is no invented buyer account or automatic email delivery.
- Sales enquiries show name, company, email, message, date and editable `new/contacted/closed` status. Overview counts new RFQs and new enquiries.
- Dependency security fixes from Part B are retained. No external service was connected by the developer.

## Start on Windows

Follow [WINDOWS_SETUP.md](WINDOWS_SETUP.md) for exact PowerShell commands and expected output for extraction, install, local tests/build, Atlas check, seed, dev server, health check and Postman.

Your `MONGODB_URI` stays in `server/.env` on your own laptop. **No default production credentials exist.** Buyers register; `npm run seed` creates the first admin only from your `ADMIN_EMAIL`/`ADMIN_PASSWORD`. Seed is idempotent and refuses to silently promote an existing buyer.

```powershell
npm ci
# Configure server/.env privately using WINDOWS_SETUP.md.
npm run db:check
npm run seed
npm run dev
```

Frontend: `http://localhost:5173`; health: `http://localhost:5000/api/health`. Admin password login redirects to `/admin`. There is no public link advertising that route.

## Verification

```powershell
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

39 API/React regression checks and 7 Chromium browser scenarios passed against disposable SQLite fixtures. The 49-request/53-assertion core Postman collection also passed against that harness. See [VALIDATION.md](VALIDATION.md) for exact cases and limits. These checks do not claim that your Atlas, Render, Vercel, Stripe, Cloudinary or email accounts are connected or verified.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-postman.ps1
```

Run this after starting your own API. It prompts for your seeded admin, uses a fresh test buyer and temporary local credentials file, and executes only core folders 01–06. [Postman instructions](postman/README.md) explain the optional payment/file/reset groups.

## Architecture and deployment

[DEPLOYMENT.md](DEPLOYMENT.md) contains the complete endpoint/permission inventory, database envelope and collection queries, Windows setup, GitHub push instructions, Atlas setup, Render/Vercel variables, CORS/cookies, Stripe/Cloudinary setup and your ordered connection checklist.

- `client/`: storefront, account/admin UI, in-memory session and API helper.
- `server/`: Express adapter, trusted ingress, Atlas models/store and admin seed.
- `shared/`: route handlers, auth, validation, domain, catalog and provider boundaries.
- `worker/`, `db/`, `drizzle/`, `.openai/`: retained private demo runtime, schema and hosting metadata.
- `tests/`: SQLite-backed API/security tests, React regression checks, and real browser harness.
- `postman/`: collection and blank environment; `scripts/run-postman.ps1`: local acceptance runner.

The seed catalog remains unapproved. Supply approved specifications, prices, SDS/COA, legal/contact information and configured providers before commercial launch. Production password reset does not send mail until you implement your chosen email adapter. No Atlas URI, real credentials or populated local environment files are included in this source archive.
