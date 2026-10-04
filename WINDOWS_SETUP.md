# Run Valence on your Windows laptop

Your MongoDB URI stays only in `server\.env` on your laptop. None of the following commands send it to the developer. Use **PowerShell**, Node **22.13+** and Git. Keep the API in Stripe test mode until you have completed your own live-service checks.

## 1. Extract and install — PowerShell window 1

Download `valence-production-ready-source.zip` into your Downloads folder, then run:

```powershell
$zipPath = Join-Path $env:USERPROFILE 'Downloads\valence-production-ready-source.zip'
$extractDir = Join-Path $env:USERPROFILE 'Valence-Oct04'
Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir
Set-Location (Join-Path $extractDir 'valence-chemical-group')
node --version
npm --version
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Stop here.' }
npm test
if ($LASTEXITCODE -ne 0) { throw 'Automated checks failed. Stop here.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed. Stop here.' }
```

Expected: Node reports v22.13.0 or newer; `npm ci` succeeds; tests have **zero failures**; Vite prints `built in ...`; the root build completes. Depending on Node's reporter, tests show five passing test files or individual cases. There are **39 named checks** in those files. Experimental SQLite warnings on Node 22 are informational. Installation may also warn that a retained Drizzle loader is deprecated; the final audit in this revision was zero vulnerabilities.

If `Valence-Oct04` already exists, choose a new extraction directory instead of overwriting your configured `.env` or edits. Update the directory in subsequent commands to match.

## 2. Configure your private local environment

```powershell
if (-not (Test-Path 'server\.env')) { Copy-Item 'server\.env.example' 'server\.env' }
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
notepad server\.env
```

The Node command prints a random 96-character hexadecimal JWT secret. Copy it into `JWT_SECRET`; never share it. In Notepad fill:

```dotenv
NODE_ENV=development
PORT=5000
TRUST_PROXY_HOPS=0
MONGODB_URI=YOUR_PERSONAL_ATLAS_CONNECTION_STRING_WITH_VALENCE_DATABASE
JWT_SECRET=THE_RANDOM_SECRET_YOU_JUST_GENERATED
FRONTEND_ORIGIN=http://localhost:5173
COOKIE_SAME_SITE=lax
ADMIN_EMAIL=YOUR_CHOSEN_ADMIN_EMAIL
ADMIN_PASSWORD=YOUR_UNIQUE_PASSWORD_OF_12_TO_72_CHARACTERS
```

These uppercase values are instructions to replace, not usable credentials. Retain the optional Stripe/Cloudinary variables from `.env.example` and leave them blank until you connect your own services. If an env password contains `#` or whitespace, wrap the entire value in double quotes. Do not put this file in Git or paste its contents into a support message. Close Notepad after saving.

Atlas setup: create your cluster → add a database user with `readWrite` on `valence` → add your laptop's public IP under Network Access → Connect → Drivers → Node.js → copy URI. URL-encode reserved characters in the URI's password and include `/valence` before the query string. The Atlas website account and database user are different accounts. Full Atlas/Render/Vercel instructions are in `DEPLOYMENT.md`.

## 3. Verify Atlas, seed catalog/admin, verify again

From the project root:

```powershell
npm run db:check
if ($LASTEXITCODE -ne 0) { throw 'Atlas check failed. Stop before seeding.' }
npm run seed
if ($LASTEXITCODE -ne 0) { throw 'Seeding failed. Stop here.' }
npm run db:check
if ($LASTEXITCODE -ne 0) { throw 'Post-seed Atlas check failed.' }
```

Expected on a new database before seed:

```text
Database connection: OK
Transaction read: OK
Catalog records: 0
Administrator accounts: 0
```

Expected seed output:

```text
Created the configured administrator.
Added 12 catalog records. Existing products and users were preserved.
Seed prices/specifications are unapproved; approve product data, pricing, SDS and COA before checkout.
```

Expected after seed: connection/transaction `OK`, catalog records `12`, administrator accounts `1`. Existing databases may have higher counts. Re-running seed should report `Administrator already exists; password and role unchanged.` and `Added 0 catalog records...`. It does not change an existing password. If your chosen admin email belongs to a buyer, seed fails clearly and does not promote that buyer; choose an unused email.

After success remove `ADMIN_PASSWORD` from `.env` and keep it in your own password manager. The account continues to work. Remove `ADMIN_EMAIL` too if you will not provision another account; setting only one of the pair causes future seed validation to fail.

## 4. Start the app — leave this window open

```powershell
npm run dev
```

Expected: Vite gives `http://localhost:5173/`; Express reports its port 5000. This command keeps running. If Vite offers 5174 because 5173 is already occupied, stop the conflicting process or consistently update `FRONTEND_ORIGIN` and your test runner's origin; the default commands below assume 5173.

## 5. Health/browser check — PowerShell window 2

```powershell
Set-Location (Join-Path $env:USERPROFILE 'Valence-Oct04\valence-chemical-group')
$health = Invoke-RestMethod -Method Get -Uri 'http://localhost:5000/api/health'
$health | ConvertTo-Json
if ($health.ok -ne $true) { throw 'Health check failed.' }
Start-Process 'http://localhost:5173/login'
```

Expected JSON includes:

```json
{"ok":true,"service":"valence-api","mode":"production","timestamp":"..."}
```

`mode: production` here means the real Express/MongoDB runtime, even with `NODE_ENV=development`. It does not mean that you have launched publicly or enabled live payments.

Sign in with your seeded admin: you should go directly to `/admin`. A buyer registers at `/register` and goes to `/account` (or the permitted page they came from). No Admin demo button or public Staff portal link exists. Buyer demo is present only in the retained Cloudflare demo, not the Express runtime.

## 6. Run Postman core checks from PowerShell window 2

The provided script runs the standard Newman CLI on your laptop. It prompts for your admin credentials without displaying the password, generates a fresh test buyer, uses a temporary environment file outside the project, and deletes that file when it exits. It uses no Postman API key, cloud workspace or developer account.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-postman.ps1
if ($LASTEXITCODE -ne 0) { throw 'Postman acceptance failed. Review the failed request.' }
```

`-ExecutionPolicy Bypass` applies only to this script process; it does not change your machine's saved policy. If an organization policy blocks scripts, use the Postman desktop import route below.

Prompts:

```text
Your seeded ADMIN_EMAIL: [enter your email]
Your seeded ADMIN_PASSWORD: [enter your password; hidden]
```

Expected: **49 requests, 53 assertions, zero failed**, followed by:

```text
POSTMAN CORE: PASS (zero failed assertions). Temporary credentials file removed on exit.
```

The first run may download Newman 6.2.2 from npm. The core checks create one labelled test buyer, one guest RFQ, one buyer RFQ, an address, a cart line, a sales enquiry and an unpaid quote order in **your Atlas database**. They test admin visibility, quote handling, contact status changes, ownership, invalid input and logout. They do not call Stripe, Cloudinary or email delivery. Some deliberately invalid requests return 400/401/403/409: those are expected when the corresponding assertion passes. Repeat runs generate a different buyer; records remain available for your review.

For another deployment:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-postman.ps1 -BaseUrl 'https://YOUR-API.onrender.com/api' -FrontendOrigin 'https://YOUR-FRONTEND.vercel.app'
```

Replace those two URLs with your own. If repeated runs exhaust login limits, wait 15 minutes before another run. Do not weaken the application limits to make a test pass.

**Postman desktop alternative:** Import `postman\Valence.postman_collection.json` and `postman\Valence.postman_environment.json`, select the environment, fill local private buyer/admin values, and run folders 01–06. Use a new buyer email on each fresh full run. The remaining 14 requests in optional folders 07–09 require your Stripe/Cloudinary/email setup. Sign back in as buyer before those folders because the core suite ends by testing logout. Do not export populated environments into Git.

## 7. Browser regression suite (optional, no Atlas needed)

The automated browser suite uses a disposable SQLite database and test-only accounts inside the harness. It never reads `server/.env` and never connects to Atlas or other external services.

```powershell
npx playwright install chromium
npm run test:browser
```

Expected: **7 passed**. This covers real Chromium registration/login forms, errors, reset through an in-memory test email sink, simultaneous tabs, reload/logout, guest and buyer submissions, admin login and status changes. A real email provider is still required for actual emailed reset links.

## 8. Your live browser acceptance and what to report

Use your laptop's running app:

1. Register a buyer, try a wrong password, and verify duplicate email/weak/empty form messages.
2. Visit `/cart` while signed out, log in, and confirm return to `/cart`.
3. Open two `/account` tabs and refresh both together; then sign out in one and confirm the other returns to login.
4. From the home page, submit a guest RFQ and Contact sales message. Sign in as admin and verify details, quote/review/decline, contact `new → contacted → closed`, and Overview counts.
5. Submit a buyer RFQ and verify its own account history. After connecting Cloudinary, attach your PDF and verify staff access and another buyer's denial.
6. Without an email provider, forgot-password returns a generic success message but sends no email. Production never exposes a reset token. After wiring your own provider, verify an actual reset link, expiry and single use.
7. After connecting Stripe TEST mode and approved products, run optional checkout and verify only a valid webhook marks payment paid.

Send back only:

```text
Node version:
DB check: OK/FAILED (redacted error name)
Seed: added count / admin created or existing
Health: ok and mode
Postman: requests, assertions, failure count
Browser: admin redirect / two tabs / guest RFQ / contact status
Any failing request: method, path, HTTP status, message (no secrets)
```

Never send the URI, passwords, tokens, raw environment files or a full network trace containing credentials.
