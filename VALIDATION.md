# Validation — 4 October 2026

## Results

| Gate | Result |
| --- | --- |
| Part A checkpoint | Original 18 automated checks and build passed. |
| Part B checkpoint | 26 automated checks and build passed; dependency vulnerabilities corrected. |
| Part C implementation | 33 automated checks and build passed; four Chromium auth scenarios passed. |
| Final Part D source | `npm test` passes: 39 checks across five files. `npm run build` passes for React and the retained Worker bundle. |
| Browser acceptance | Seven Chromium scenarios passed against the Express adapter + SQLite harness. |
| Postman acceptance | Core folders 01–06: 49 requests, 53 assertions, zero failures against the same SQLite harness. |
| Dependency audit | Zero vulnerabilities in the final application dependency tree. |
| Your Atlas and live providers | Not connected or tested here. Run WINDOWS_SETUP.md on your laptop and return redacted results. |

Node runtime used: 24.19.0. The sandbox's `node --test` aggregate reporter displays five passing files; direct file runs confirm the named checks: API 18, security 5, React 3, auth 7, admin 6. Browser tests used Playwright 1.58.2 with a downloaded official Chromium Headless Shell 134 executable because the default browser archive was unavailable here. On your laptop `npx playwright install chromium` installs the matching browser for the locked Playwright version. The browser suite is separate from `npm test` and runs with `npm run test:browser`.

No URI, actual user password, payment credential or external account was supplied to this environment. The test harness constructs disposable SQLite records and an in-memory reset-email sink/file bucket. Those exist only under `tests/`; they are never fallback providers in the production server. The PowerShell wrapper itself has not been executed on Windows here; its underlying Newman collection and commands were exercised against SQLite. Your Windows/Atlas run is the remaining environment verification.

## Part C — auth cases

| Scenario | API/harness | Chromium screen result |
| --- | --- | --- |
| Valid registration and login | PASS, normalized email, buyer role and safe response | PASS |
| Wrong password for existing user | PASS, 401 with clear message | PASS, error shown and successful retry |
| Duplicate email | PASS, 409 | PASS, error shown |
| Weak password and empty fields | PASS, server rejects invalid schemas | PASS, native required/minimum-length validation |
| Return to original page | Safe local path validation retained | PASS, signed-out cart → login → cart |
| Switching auth screens | Form/error reset by route key | PASS, error/password cleared on navigation |
| Forgot-password | Same response for known/unknown account; no production token exposure | PASS with test-only email sink |
| Reset-password | Weak/expired/invalid/reused tokens rejected; old sessions revoked | PASS, new password login; reused/missing link error |
| Logout | Both access and refresh tokens invalidated | PASS, other tab returns to login |
| Reload | Fresh client restores from cookie; 80 rotations covered by Part B | PASS, account restored |
| Multiple tabs | Concurrent rotations serialize and leave sessions active | PASS, two tabs reloaded together four times |
| Temporary refresh failure | 429/network error retains in-memory token; only 401 clears it | PASS, retry view stays on account and recovers |
| Token storage | Session client keeps access tokens in memory | PASS, HttpOnly cookie, no session/token keys in localStorage |

The email sink tests the real reset code path without sending mail. Production forgot-password returns the generic response and records an undelivered notification until you implement your own `notifications.sendReset` adapter. Actual emailed resets remain a live-service check.

## Part D — admin and public data cases

| Scenario | Result |
| --- | --- |
| Admin password login at normal `/login` → `/admin` | PASS in Chromium and API fixtures. |
| Buyer direct `/admin` navigation or admin API requests | PASS, denied in UI and by backend role checks. |
| No Admin demo bypass | PASS, button absent; API rejects admin role; legacy demo-admin sessions rejected. |
| Buyer demo retained | PASS, button appears only under demo config; buyer-only demo API still issues buyer session. |
| Public Staff portal link removed | PASS, no footer/home public admin link. Admin-only signed-in navigation remains. |
| Home → guest RFQ → staff queue/detail | PASS, contact, CAS, amount, purity, region, notes preserved. |
| Guest RFQ review → quote → decline | PASS through browser and API; no buyer account fabricated. |
| Buyer RFQ ownership and private attachment | PASS, staff sees/downloads fixture PDF; unrelated buyer/guest denied. |
| Home → Contact sales → admin enquiries | PASS, name/company/email/message/date visible. |
| New/contacted/closed enquiry status | PASS, persisted across reload; invalid status/extra fields/buyer mutation rejected. |
| Overview new RFQ/new enquiry counts | PASS, reflect submission and review/status changes. |
| Seeded real admin account | PASS, password login, idempotent seed, no silent buyer promotion. |

## Security retained

The original API checks still pass for refresh replay revocation, CSRF/origin checks, password hashing/reset single use, buyer ownership, restricted attachments, schema/injection rejection, atomic stock reservation, cancellation, quote conversion, signed Stripe webhook validation and idempotent payment updates. Per-session refresh limits, normalized-email login limits and trusted adapter IP handling are covered by regression tests.

Dependency fixes: Drizzle ORM 0.45.3, Drizzle Kit 0.31.11, scoped patched esbuild override, unused morgan/cookie-parser/jsonwebtoken/stripe SDK removed. `npm run db:generate` was checked after the dependency change and found no schema differences.

## Still yours to verify

- Your Atlas database/user/network settings, transaction support, seed and health endpoint.
- Windows runtime and PowerShell runner; repeat core Postman checks against your own API.
- Render ingress/CORS, Vercel API URL, HTTPS cookie persistence with your domains.
- Your Cloudinary upload/download permissions and your Stripe TEST checkout/webhook delivery.
- Your email adapter, actual reset delivery and recipient/domain configuration.
- Approved specifications, prices, SDS/COA, stock, certifications and reviewed legal/contact content before commercial launch.

The source changes are complete; no deployment was published and no Library upload was attempted in this turn.
