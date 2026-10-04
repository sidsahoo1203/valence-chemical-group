# Valence — architecture, local setup and production deployment

> Parts A–D are implemented and checked with the SQLite/React/Chromium harness. Your own Atlas and external-service verification stays on your Windows laptop. Start with [WINDOWS_SETUP.md](WINDOWS_SETUP.md) for exact commands and expected output, and [VALIDATION.md](VALIDATION.md) for test results. No external service has been connected by the developer.

## 1. Where the API runs

The React app is downloaded from Vercel and runs in the buyer's browser. Express runs continuously on Render. MongoDB Atlas stores production records. These are separate services connected by HTTPS and the MongoDB connection string.

Example: **Add to cart** calls `api('/cart/items', {method:'POST', body:{productId:'acetone', packagingType:'drum', quantity:1}})` in `client/src/lib/api.js`. The helper attaches the in-memory access token and request verification header. Locally, `/api/cart/items` goes through Vite's proxy to port 5000; on Vercel, `VITE_API_URL=https://YOUR-API.onrender.com/api` sends it directly to Render. Express `server/src/app.js` applies security headers, CORS, rate limits and raw-body limits. It adapts the request to `shared/api.js::handleApi()`. That function checks the origin, token/session, schema and stock. `domain.js` supplies `required()` and `cartView()` and transaction helpers for checkout. `MongoStore` reads the Product and Cart, commits the new cart in a MongoDB transaction, and returns a freshly calculated cart. JSON travels back to React. The browser cannot supply trusted prices or mark an order paid.

### Endpoint inventory

All paths below start with `/api`. Guest means no app login is required; buyers and admins can also use guest routes. Authenticated routes accept buyer or admin unless explicitly restricted. Owner checks still apply. `owns()` permits staff to inspect orders/RFQs but only the owning buyer may accept a quote. All non-webhook writes require `X-Valence-Client: web`; browser Origin must match `FRONTEND_ORIGIN`.

| Method and path | Who | Purpose |
| --- | --- | --- |
| GET `/health` | Guest | Confirm database is reachable; report runtime mode. |
| GET `/config` | Guest | Public feature flags, never credentials. |
| POST `/auth/register` | Guest | Create buyer only and issue session. |
| POST `/auth/login` | Guest | Verify email/password and issue session. |
| POST `/auth/refresh` | Valid refresh cookie | Rotate refresh token and issue access token. |
| POST `/auth/logout` | Guest/cookie holder | Revoke cookie's session and clear cookie. |
| POST `/auth/forgot-password` | Guest | Generic response; prepare reset and call email provider. |
| POST `/auth/reset-password` | Valid reset token | Change password, consume reset, revoke sessions. |
| POST `/demo/session` | Authenticated private demo visitor only | One-click buyer demo session only; admin role is rejected and Express production disables this endpoint. |
| GET `/products` | Guest | Search `q` by name/CAS/grade and filter `category`. |
| GET `/products/:id` | Guest | One active chemical and packaging specifications. |
| POST `/estimate` | Guest | Calculate volume, discount, freight and lead time. |
| GET `/files/:id` | Guest for catalog-linked files; owner/admin for private attachments | Authorized streamed file download. |
| POST `/rfqs` | Guest or signed-in user | Save a requirement and contact details; attachments require login and ownership. |
| POST `/contact` | Guest | Save sales enquiry. |
| GET, PATCH `/me` | Authenticated | Read/update own company profile. |
| GET, POST `/addresses` | Authenticated | List/create own delivery addresses. |
| PATCH, DELETE `/addresses/:id` | Address owner | Update/remove own address. |
| GET `/cart` | Authenticated | Read own persisted cart with current calculated prices. |
| POST, PATCH, DELETE `/cart/items` | Authenticated | Add, change quantity, or remove own line. |
| POST `/checkout` | Authenticated owner | Reserve stock/snapshot price or pay own pending order; create Stripe session. |
| GET `/orders` | Authenticated | Own order history. |
| GET `/orders/:id` | Owner/admin | Order detail. |
| POST `/orders/:id/cancel` | Owner/admin | Cancel unpaid order and restore stock once. |
| POST `/orders/:id/demo-pay` | Owner/admin, private demo only | Explicit simulated payment. |
| GET `/rfqs` | Authenticated | Own RFQ history. |
| GET `/rfqs/:id` | Owner/admin | Requirement, quote and permitted attachments. |
| POST `/rfqs/:id/respond` | Owning buyer only | Accept into an unpaid order or decline an open quote. |
| POST `/uploads` | Authenticated for attachment; admin for image/SDS/COA | Validate and upload file, maximum 10 MB. |
| GET `/admin/metrics` | Admin | Revenue, orders, buyers, pending/new RFQs, new sales enquiries and stock alerts. |
| GET, POST `/admin/products` | Admin | List/create catalog records. |
| PATCH, DELETE `/admin/products/:id` | Admin | Edit or archive product. |
| GET `/admin/orders` | Admin | All orders, optional `status` filter. |
| PATCH `/admin/orders/:id` | Admin | Sequential paid-order fulfillment and tracking notes. |
| GET `/admin/rfqs` | Admin | Guest and buyer RFQs, optional `status` filter. |
| POST `/admin/rfqs/:id/quote` | Admin | Price, lead time and notes. |
| POST `/admin/rfqs/:id/status` | Admin | Review or decline an open request. |
| GET `/admin/buyers` | Admin | Buyer list without password hashes. |
| GET `/admin/buyers/:id` | Admin | Buyer details, orders and RFQs. |
| GET `/admin/contacts` | Admin | All sales enquiries, optional `status` filter. |
| PATCH `/admin/contacts/:id` | Admin | Set new/contacted/closed status; retain message and record update timestamp/staff ID. |
| POST `/webhooks/stripe` | Stripe with verified signature | Confirm payment from provider; verify amount/reference/scope and deduplicate. |

### Authentication in plain language

The access JWT lasts 15 minutes and stays in JavaScript memory, never localStorage. Refresh JWTs last seven days and are in an HttpOnly cookie restricted to `/api/auth`. JavaScript cannot read that cookie. Production HTTPS adds Secure. On refresh, the server verifies the JWT, user, session and stored token hash, replaces that hash and cookie, and returns a new access token. Reuse of an old refresh token revokes the session. Logout revokes it; password reset revokes all sessions. Requests also check the stored session, so logout is effective before access-token expiry. Reloading a page restores the session through its cookie. Refresh has its own database limit of 900 requests per verified session per 15 minutes (Express outer limit 1200); invalid refresh attempts have a separate 60/IP limit. Login/register/reset use strict shared 35/IP and outer 60/IP limits; login also has 10/normalized-email. The client uses Web Locks to serialize refresh/login/logout across same-origin tabs, and BroadcastChannel to announce session changes without sending tokens. Both were tested in Chromium. Use a current Chrome/Edge/Firefox/Safari on HTTPS (localhost is allowed); browsers without Web Locks have only single-tab serialization. Only 401 clears a session; transient refresh failures retain it and offer Retry. Auth-page navigation resets form/error state, and buyer returnTo is limited to safe non-admin local paths.

## 2. Where the database and files live

Production uses **your MongoDB Atlas** via `server/.env` locally and Render's `MONGODB_URI` in deployment. There is no fallback database in Express. Transactions need a replica set; Atlas provides one.

`User`, `Email`, `Session`, `Reset`, `Product`, `Cart`, `Order`, `RFQ`, `Address`, `File`, `Webhook`, `Notification`, `Contact`, `Meta` use an envelope `{scope, id, owner, data, version}` (plus MongoDB `_id`). Business fields are inside `data`; `owner` indexes the buyer; `version` prevents stale concurrent writes. Production scope is `production`. **Correction: `RateLimit` does not use this envelope.** It stores `{_id, count, expires}` with a TTL index. Mongoose normally pluralizes/lowercases collection names: `users`, `emails`, `sessions`, `resets`, `products`, `carts`, `orders`, `rfqs`, `addresses`, `files`, `webhooks`, `notifications`, `contacts`, `metas`, `ratelimits`. Check actual names with `show collections`.

| Model | Contents |
| --- | --- |
| User / Email | Account/password hash/role and unique normalized-email lookup. |
| Session / Reset | Refresh-token hash/session status and single-use reset-token hash. |
| Product / Cart | Catalog specifications/packaging and buyer selections. |
| Order / RFQ | Snapshotted purchase/payment history and technical/commercial requests. |
| Address / File | Delivery addresses and metadata/storage references, not file bytes. |
| Webhook / Notification | Processed payment event IDs and notification/outbox status. |
| Contact / Meta | Public sales messages and internal initialization metadata. |
| RateLimit | Request counters and expiry dates. |

**Atlas:** open your project → Database/Clusters → your cluster → Browse Collections → `valence` → a collection. Filter users by `{"scope":"production","data.email":"your@email.com"}`. Expand `data`. Treat this view as administrative access: hashes, session metadata and customer details are sensitive.

**Compass:** install MongoDB Compass, New Connection, paste your URI privately, connect, select `valence`, open a collection and expand `data`. Do not paste connection strings into screenshots or git.

**mongosh:** in Atlas choose Connect → Shell, use the provided command and enter the password at its prompt. Avoid a password-bearing URI in command history. Then:

```javascript
use valence
show collections
db.products.find({scope:'production'}, {'data.name':1,'data.casNumber':1,'data.approved':1})
db.users.find({scope:'production'}, {'data.name':1,'data.email':1,'data.role':1})
db.orders.find({scope:'production','data.paymentStatus':'paid'}).sort({'data.createdAt':-1})
db.rfqs.find({scope:'production','data.status':'submitted'})
db.contacts.find({scope:'production','data.status':'new'})
db.carts.find({scope:'production',owner:'BUYER-ID'})
db.notifications.find({'data.deliveryStatus':'provider-not-configured'})
db.ratelimits.find({}, {_id:1,count:1,expires:1})
```

The **existing private demo** uses Cloudflare D1's SQLite `records` table with `scope`, `kind`, `id`, `owner`, JSON `data`, and `version`, plus `rate_limits` and a transactional guard. Each private visitor has an isolated scope. `npm test` uses disposable in-memory SQLite fixtures with the same D1 adapter; these are automated regression fixtures, not an application database or an external service. Neither is your production Atlas data. Files live in authenticated Cloudinary storage for production and R2 for the existing demo; MongoDB/D1 hold metadata only.

## 3. Sign-in credentials and creating your admin

**There are no production default accounts or default passwords.** Buyers register at `/register`. Your first admin is created by `npm run seed` with `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Successful staff password login at `/login` redirects to `/admin`; buyers return to a permitted requested page or `/account`. The Admin demo button and API bypass are removed, including rejection of legacy demo-admin sessions. There is no public Staff portal link. Use an email that has not already registered as a buyer: the seed preserves existing users and does not silently promote them. Never edit a user's role from a public API.

The Buyer demo button calls `/api/demo/session` with `{role:'buyer'}` and creates a session for the isolated pre-seeded buyer. It is shown only when `/api/config` reports demo mode. The Worker additionally requires its private hosting identity. It is unavailable in the Render/Express runtime. Keeping this button does not turn on demo authentication in production.

To create your own admin locally: follow the Atlas setup below, fill `server/.env`, set your chosen `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` of 12–72 characters, run `npm run seed` in the repository root, then sign in at `http://localhost:5173/login`. Remove the seed password from the file after successful creation. Re-running the seed does not reset an existing password.

## 4. Windows local setup — use PowerShell

Install Node.js 22.13+ (or supported newer LTS), Git and optionally Compass/mongosh. Extract the source ZIP and open PowerShell in its `valence-chemical-group` directory.

```powershell
node --version
npm --version
npm ci
Copy-Item server/.env.example server/.env
notepad server/.env
```

Generate a JWT secret privately and paste the result into `server/.env`:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Keep `NODE_ENV=development`, `PORT=5000`, `FRONTEND_ORIGIN=http://localhost:5173`, `COOKIE_SAME_SITE=lax`. Use `MONGODB_URI` from your Atlas cluster, plus your JWT secret and admin credentials. Leave optional service credentials blank until you connect your accounts. `VITE_API_URL` can stay unset locally; the Vite proxy handles `/api`.

### Atlas setup (do this before any app database verification)

1. Sign into **your** [MongoDB Atlas](https://cloud.mongodb.com/). Create a project named Valence and create a free cluster if available in your chosen region.
2. In Database & Network Access / Database Access, add a **database user**, using password authentication. This is separate from your Atlas website account. Choose a strong generated password and grant `readWrite` on database `valence` (custom database privileges if needed), not organization-wide administrative access.
3. In Network Access, add your laptop's current public IP. For Render later, open the service → Connect → Outbound and add **all displayed outbound CIDR ranges** to Atlas. Do not leave `0.0.0.0/0` enabled. A changed laptop IP must be updated.
4. Cluster → Connect → Drivers → Node.js. Copy the URI. Replace username/password using URL encoding for reserved characters; include `/valence` before `?`, e.g. `mongodb+srv://USER:ENCODED_PASSWORD@YOUR_CLUSTER/valence?retryWrites=true&w=majority`.
5. Paste the real URI into `server/.env` only. Do not send it in chat or commit it. Keep this file on your Windows laptop. Run `npm run db:check`, seed and the supplied acceptance checks there; share only redacted results. The developer does not need or request your URI.
6. Verify and seed only after credentials are in place (`db:check` checks ping, replica-set support and a transactional read):

```powershell
npm run db:check
npm run seed
npm run db:check
npm run dev
```

Open `http://localhost:5000/api/health` (should report `ok:true`, mode `production`) and `http://localhost:5173`. The mode means the real Express backend, even in local development. Check Atlas for 12 products and your admin. Seed data are unapproved; use approved specifications, pricing, SDS and COA before checkout.

The request requires all running application data to use your Atlas. For reference, a **local alternative** requires an actual replica set, not standalone MongoDB: install MongoDB Community and mongosh, create `C:\valence-mongo`, run `mongod --dbpath C:\valence-mongo --replSet rs0 --bind_ip localhost`, then in another terminal run `mongosh --eval "rs.initiate()"`. Wait for PRIMARY. The URI is `mongodb://localhost:27017/valence?replicaSet=rs0`. This is an alternative only if you choose it; do not substitute it for your requested Atlas. The updated validator accepts both SRV and standard MongoDB URIs.

### Environment-variable reference

| Variable | Where | Value/purpose |
| --- | --- | --- |
| NODE_ENV | server/.env, Render | development locally; production on Render. |
| PORT | server/.env / Render runtime | 5000 locally; honor Render's injected port. |
| MONGODB_URI | server/.env, Render secret | Your Atlas URI and database name. Never a Vite variable. |
| JWT_SECRET | server/.env, Render secret | Random 32+ characters; stable per environment. Rotating signs everyone out. |
| FRONTEND_ORIGIN | server/.env, Render | Exact frontend origin, including scheme, no path or trailing slash. |
| TRUST_PROXY_HOPS | server/.env, Render | 0 for direct localhost; 1 for direct Render ingress, already set by render.yaml. |
| COOKIE_SAME_SITE | server/.env, Render | lax for localhost/custom sibling subdomains; none for vercel.app → onrender.com. |
| ADMIN_EMAIL / ADMIN_PASSWORD | server/.env or temporary seed environment | Only seed-time credentials; remove after provisioning. |
| STRIPE_SECRET_KEY | server/.env, Render secret | Your `sk_test_...` initially. |
| STRIPE_WEBHOOK_SECRET | server/.env, Render secret | Your endpoint/listener-specific `whsec_...`. |
| CLOUDINARY_CLOUD_NAME | server/.env, Render | Your Cloudinary product environment. |
| CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET | server/.env, Render secrets | Your server-side credentials. |
| VITE_API_URL | client/.env if needed, Vercel | Full API prefix, e.g. `https://api.example.com/api`. Public, build-time only. |

Email delivery is not implemented merely by setting a variable. `shared/providers.js::notifyReset` accepts `config.notifications.sendReset({email,resetUrl})`; wire your chosen provider in the server before enabling live resets. The current outbox intentionally contains no reset secret and production does not return reset URLs. There is no provider account supplied by the developer.

## 5. Push to your GitHub

Create an empty private repository in your GitHub account (no generated README). In PowerShell at the project root:

```powershell
git init
git branch -M main
Get-Content .gitignore
git check-ignore server/.env node_modules client/dist
# Review the staged filenames carefully before committing.
git add .
git diff --cached --name-only
git commit -m "Prepare Valence procurement platform"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

`.gitignore` excludes `.env`, `.env.*` except `.env.example`, `node_modules`, `dist`, logs and local platform settings. Keep Postman secrets in your own local environment, never export populated credentials into git. If a secret was ever committed, deleting the file is insufficient: rotate the secret and remove it from history.

## 6. Render API and Vercel frontend

**Render:** connect your own GitHub in Render, New → Blueprint → select your repo and `render.yaml`. Keep root directory at repository root. Build `npm ci`; start `npm --workspace server start`; health path `/api/health`; Node 22. Configure every secret from the table. Atlas network access must include Render's outbound ranges. Set `FRONTEND_ORIGIN` to the eventual Vercel/custom origin. Check logs and `/api/health` after deploy.

**Seed:** run `npm run seed` from a Render shell if your plan offers one, with temporary admin variables configured, then remove them. Alternatively seed from your Windows laptop using the same Atlas database and local admin variables. Do not make seeding an automatic web start/build step. Catalog seeding is idempotent; it preserves existing records.

**Vercel:** import your repo yourself, framework Vite, root directory repository root. `vercel.json` sets install `npm ci`, build `npm run build --workspace client`, output `client/dist`, and React Router fallback. Set `VITE_API_URL=https://YOUR-API.onrender.com/api` in the deployment environment. Deploy/redeploy whenever that variable changes. Set Render `FRONTEND_ORIGIN` to the exact resulting origin and redeploy the API. Do not put secrets in variables prefixed `VITE_`.

### Cookies, CORS and proxies

With Vercel and Render default domains, use `COOKIE_SAME_SITE=none`, production HTTPS, Secure cookies and exact-origin credentialed CORS. The client already uses `credentials:'include'`. Browsers that block third-party cookies may still refuse refresh cookies. Recommended: use `shop.yourdomain.com` on Vercel and `api.yourdomain.com` on Render, both HTTPS; set API URL to `https://api.yourdomain.com/api`, frontend origin to `https://shop.yourdomain.com` and SameSite to `lax`. These are different origins but the same site. The host-only cookie stays on the API domain; no wildcard Domain attribute is needed. Follow each platform's displayed DNS instructions in your own registrar.

Render ingress must be the only path to the API when trusting one proxy hop. Never use unrestricted `trust proxy=true`. Verify the actual forwarding chain after deployment, especially if you add another proxy; Express must derive the real client from the trusted nearest hop. Forwarded-looking request headers must not override that derived IP inside the shared API.

## 7. Connect Stripe and Cloudinary yourself

**Stripe:** use your test-mode account, copy `sk_test_...` into `STRIPE_SECRET_KEY`. In Workbench → Webhooks, create an event destination for `https://YOUR-API/api/webhooks/stripe`, subscribing to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `checkout.session.async_payment_failed`. Put that endpoint's signing secret in `STRIPE_WEBHOOK_SECRET`; redeploy. Locally run your Stripe CLI `stripe login`, then `stripe listen --forward-to localhost:5000/api/webhooks/stripe` and use the listener's own `whsec_...` in local env. Complete a test checkout against an approved product. Verify in Stripe event delivery history, Atlas orders and the UI that it becomes paid only after the webhook. Resending that real event should not double-charge inventory or duplicate history. A generic generated event with no matching order metadata will not pay an order.

**Cloudinary:** create/use your own product environment, obtain cloud name, API key and API secret from its dashboard, add the three corresponding variables in local env and Render, then restart. Upload an approved image/PDF through the admin product form. Files are uploaded as authenticated assets and streamed through the API after permission checks; no unsigned upload preset is needed. Verify SDS/COA downloads and that another buyer cannot download a private RFQ attachment. Credentials never go to React.

**Email:** choose your provider and verified sending domain, add the provider's documented secret to the server environment and implement the separated `notifications.sendReset` adapter. Test delivery to your own address, expiry, single use and session revocation before calling password reset operational.

## 8. Demo files stay unless you confirm removal

`worker/` adapts shared routes to Cloudflare. `db/` and `drizzle/` describe/migrate D1, `.openai/` describes the existing private hosting artifact, and `scripts/build.mjs` bundles frontend assets into the demo Worker. Vercel builds only `client`; Render runs only Express, so these do not switch production to D1. They are retained. Removing them would also require replacing the automated D1 fixture harness and updating build scripts; no removal is authorized by this request.

## 9. Setup checklist — your connections, in order

- [ ] Install Node 22.13+ and Git; extract source and run `npm ci`.
- [ ] Create your Atlas project/cluster and database user for `valence`.
- [ ] Allow your local IP in Atlas; add `MONGODB_URI` to `server/.env` privately.
- [ ] Set JWT secret, local frontend origin, and chosen seed admin credentials.
- [ ] Run `npm run db:check`, seed, check again, confirm catalog/admin in Atlas; remove both seed-only admin variables.
- [ ] Start locally; run `scripts/run-postman.ps1` or import the supplied collection/blank environment into your own Postman and run folders 01–06.
- [ ] Connect your Cloudinary environment; verify approved product files and private attachments.
- [ ] Connect your Stripe test account/listener; validate payment and signed webhook delivery.
- [ ] Create your private GitHub repository; verify ignored secrets; push.
- [ ] Connect Render Blueprint; configure server variables and Atlas outbound network ranges; verify health.
- [ ] Connect Vercel; configure API URL, deploy and set exact Render frontend origin.
- [ ] Connect custom subdomains if available; check CORS, cookie persistence, reload and multiple tabs.
- [ ] Choose/connect an email provider and verify the reset flow end to end.
- [ ] Supply approved chemical specifications, pricing, stock, SDS/COA, certifications and reviewed legal/contact content.
- [ ] Run production acceptance in your own Postman and browsers; confirm payments remain test mode until launch approval.
- [ ] Decide later whether the existing Cloudflare demo should be kept or removed.

## Local validation and outstanding live checks

See `VALIDATION.md` for the passed SQLite, React, Chromium and Postman results. `WINDOWS_SETUP.md` is the exact PowerShell runbook. `npm run test:browser` creates only ephemeral SQLite fixtures; it never loads your Atlas URI. Guest RFQs are reviewable/quotable/declinable by staff, but cannot be accepted online without an owning buyer account; use the supplied contact details for guest follow-up. No automatic account claiming or guest email delivery is implemented.

## Official references

- https://www.mongodb.com/docs/atlas/connect-to-database-deployment/
- https://www.mongodb.com/docs/atlas/security-add-mongodb-users/
- https://render.com/docs/outbound-ip-addresses
- https://render.com/docs/blueprint-spec
- https://vercel.com/docs/frameworks/frontend/vite
- https://vite.dev/guide/env-and-mode
- https://expressjs.com/en/guide/behind-proxies/
- https://docs.stripe.com/webhooks
- https://cloudinary.com/documentation/upload_images

- https://www.w3.org/TR/web-locks/
- https://learning.postman.com/docs/reference/newman-cli/installing-running-newman/
