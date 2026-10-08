# HighPre

DPDP compliance for Indian websites. HighPre scans a website for personal data
collection, generates a privacy notice in up to eight Indian languages, collects
and records consent through an embeddable banner (with verified parental consent
for under-18s), handles data-principal requests, guides breach response and
produces a PDF evidence pack. A desktop agent for Windows and macOS warns staff
before they paste passwords, keys, card or ID numbers into AI assistants and chat
apps, and alerts the owners, without that content ever leaving the computer.
Paid plans are billed through Razorpay.

> HighPre is software, not legal advice. Have a privacy lawyer review the notice
> templates (`src/lib/i18n/locales/*.ts`) and a native speaker review each
> translation before relying on them for customers.

## Quick start (local)

```bash
cp .env.example .env        # then fill in MONGODB_URI and the secrets
npm install
npm run dev                 # http://localhost:3000
npm test                    # unit + integration tests (in-memory MongoDB)
```

Without `SMTP_HOST`, emails (codes, invitations, password resets, reminders) are
printed to the terminal, so every flow works locally. Without Razorpay keys the
app runs with the Free plan only and the billing page says payments aren't set up.

## Features

| Area | What it does |
|---|---|
| Scanner | SSRF-safe crawl of a homepage plus form pages; finds forms, 17 trackers, consent tools, notice and grievance links; scores 0–100. |
| Data inventory | Purposes with data categories, retention, sharing, an "essential" flag and a "tracking/ads" flag; per-language wording. |
| Privacy notice | Generated in each language the site offers (English, Hindi, Bengali, Marathi, Tamil, Telugu, Gujarati, Kannada); immutable versions. |
| Consent banner | `widget.js` (~11 KB, Shadow DOM, no cookies). Picks the visitor's browser language, equal-weight accept/reject, script blocking, reopen button. |
| Children (DPDP s.9) | Optional age check. Under-18s get essentials only; a parent verifies their email with a code, declares guardianship and chooses purposes. Tracking purposes can never be enabled for a child. |
| Consent ledger | Append-only; every record carries a SHA-256 content hash. CSV export with hashes. |
| Consent analytics | Per site over 7/30/90 days: accept-all / reject-all / customised / withdrawn rates with change vs the previous period, daily chart (India time), opt-in per optional purpose, breakdown by language. Org-wide summary on the overview; 90-day statistics in the evidence pack. |
| Rights requests | Email-verified public request page in the site's languages; inbox with due dates and an audit trail. |
| Breaches | 72-hour checklist with a draft notice to affected people. |
| Vendors | Register of data processors, filled automatically from scans (one record per detected tracker or consent tool) or added by hand; DPA status, signed and renewal dates, processing country; renewal reminders 14 days ahead; listed in the evidence pack. Owners and admins edit, everyone can view. |
| Evidence pack | PDF for a chosen period: fiduciary details, team, purposes, notice versions, consent statistics with a tamper check and ledger digest, requests (on-time rate), breaches, activity log. Paid plans. |
| Team | Invitations by email, roles (owner / admin / member), several organisations per user with a switcher. |
| Two-factor sign-in | Authenticator-app codes (TOTP) after the password, set up from Your account with a QR code; 10 single-use recovery codes. Owners can require it for owners and admins (Settings), and the Team page shows who has it on. |
| Desktop agent | Windows `.exe` and macOS app, downloaded from the sidebar. Local detection of passwords, API/private keys, card and bank details, Aadhaar, PAN, passport numbers and customer lists on the clipboard while an AI or chat app is in front; warns the person and emails the owners. Signed automatic updates. See "Desktop agent" below. |
| Browser extension | Chrome/Edge extension that asks before sensitive data is pasted, dropped or sent (typed messages too) on AI, chat and paste sites. Warn or block mode; reports only the kind of data, the site and the person's choice. |
| Agent settings | Per organisation: data types to watch, approved tools, extension mode; "not sensitive" feedback with false-alarm rates per type. |
| Company-wide install | Installers for Intune, Jamf, Kandji and similar; each computer enrols itself with a rotatable organisation key. |
| Website favicons | Fetched during scans through the SSRF-safe fetcher (raster formats only), stored with the site and shown in the sidebar. |
| Billing | Razorpay Subscriptions: Free (1 site, 3 seats), Starter ₹999/mo (3 sites, 5 seats), Growth ₹2,999/mo (15 sites, 10 seats), plus GST. Checkout, signature verification, webhooks, proration on plan change, cancel at period end, GST invoices. |
| Reminders | Hourly job emails owners/admins before data requests fall due, when they're overdue, and 24 h before a breach report is due. |
| Activity log | Who changed settings, notices, the team, billing, and exports. |

### Roles

| | Owner | Admin | Member |
|---|:-:|:-:|:-:|
| Billing | ✓ | | |
| Team, business settings, activity log | ✓ | ✓ | |
| Add/delete websites, publish notices, languages, age check | ✓ | ✓ | |
| Scans, inventory, banner, requests, breaches | ✓ | ✓ | ✓ |
| See every device and leak alert, mark alerts reviewed | ✓ | ✓ | own only |

### Plans

Defined in `src/lib/billing/plans.ts` (shown in the app and on the landing page).
Limits on websites, seats and languages are enforced; the monthly consent limit
is soft: consent is **always** recorded, the dashboard just prompts an upgrade.
When a subscription lapses nothing is deleted.

## Environment

| Variable | Required | Notes |
|---|---|---|
| `MONGODB_URI` | yes | MongoDB Atlas connection string. Use the Mumbai region. |
| `APP_URL` | yes | Public URL, no trailing slash. Used in emails, notices and the widget snippet. |
| `SESSION_SECRET` | yes | 32+ random characters: `openssl rand -base64 48`. Also encrypts stored authenticator secrets: changing it turns off authenticator codes for everyone with 2FA (their recovery codes still work). |
| `IP_HASH_SALT` | yes | Random string used to hash visitor IPs. Don't change it after launch. |
| `CLIENT_IP_HEADER` | yes | Header with the real client IP: `x-real-ip` behind the bundled Caddy, `cf-connecting-ip` behind Cloudflare. Only this header is trusted. |
| `CRON_SECRET` | production | Bearer token for `POST /api/cron/run`. |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` | production | Any SMTP provider (Resend, Brevo, Zoho…). Port 465 uses TLS. |
| `MAIL_FROM` | production | e.g. `HighPre <no-reply@highpre.com>`, on a domain verified with your provider. |
| `RAZORPAY_KEY_ID` `RAZORPAY_KEY_SECRET` | for billing | Razorpay → Account & Settings → API Keys. |
| `RAZORPAY_WEBHOOK_SECRET` | for billing | The secret you set on the webhook. |
| `RAZORPAY_PLAN_STARTER` `RAZORPAY_PLAN_GROWTH` | for billing | Plan IDs (`plan_…`) from Razorpay → Subscriptions → Plans. |

## Billing setup (Razorpay)

1. Activate **Subscriptions** on your Razorpay account and start with **test mode** keys.
2. Create two monthly plans whose prices match `src/lib/billing/plans.ts` (Starter ₹999, Growth ₹2,999; add GST in Razorpay's tax settings) and put their IDs in `.env`.
3. Add a webhook: URL `{APP_URL}/api/billing/webhook`, a secret (→ `RAZORPAY_WEBHOOK_SECRET`), events `subscription.*`.
4. Upgrade from **Plan and billing** in the dashboard. Checkout is verified by signature on return; the webhook keeps the plan in sync afterwards (renewals, failed payments, cancellations). Events are deduplicated, so retries are safe.

Switching plans uses Razorpay's in-place plan change (prorated). Razorpay only
allows that for card mandates; UPI subscribers are told to cancel and resubscribe.

## Deploy to a VPS (~₹500/month)

1. Create an Ubuntu VPS (AWS Lightsail Mumbai or DigitalOcean Bangalore, 1 GB RAM is enough to start) and install Docker.
2. Point your domain's A record at the server's IP.
3. In MongoDB Atlas → Network Access, allow the server's IP.
4. On the server:

```bash
git clone <your repo> highpre && cd highpre
cp .env.example .env && nano .env      # APP_URL=https://yourdomain.com, CRON_SECRET, SMTP, Razorpay
DOMAIN=yourdomain.com docker compose up -d --build
```

Compose runs three services: the app, Caddy (automatic HTTPS) and a tiny `cron`
container that calls `/api/cron/run` hourly. Health check: `https://yourdomain.com/api/health`.

If you put Cloudflare in front, set SSL mode to **Full (strict)** and `CLIENT_IP_HEADER=cf-connecting-ip`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Builds the widget, starts Next.js in dev mode |
| `npm run build` | Production build (widget + app, standalone output) |
| `npm start` | Runs the production build |
| `npm test` | Vitest: unit tests plus integration tests on an in-memory MongoDB |
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm run build:widget` | Rebuilds `public/widget.js` from `widget/src/widget.js` |
| `npm run build:agent` | Cross-compiles the desktop agent into `agent/dist` (needs Go 1.23+) |
| `npm run test:agent` | Go tests for the agent's detection, app matching and privacy guarantees |

The first `npm test` downloads a MongoDB binary (~70 MB) for the integration suite.

## Project structure

```
src/
  app/
    (marketing)/        Landing page with pricing, free scan report, HighPre's own privacy notice
    (auth)/             Login, register, password reset
    invite/[token]/     Accept a team invitation
    dashboard/          Overview, websites, requests, breaches, evidence pack, team,
                        settings, billing, activity, account
    p/[siteKey]/        Public pages per customer site: notice, request form, parental consent
    api/public/         Widget and public-page endpoints (CORS, rate-limited)
    api/billing/        Razorpay webhook
    api/cron/           Scheduled jobs
  features/<feature>/   Server actions + feature-specific client components
  components/ui/        Design-system primitives (Button, Field, Panel, Badge, Callout, Meter, StatCard…)
  lib/
    auth/               Session tokens (edge-safe), guards, roles and permissions
    billing/            Plans, Razorpay client, subscription sync, usage limits
    consent/            Ledger writes and content hashing
    evidence/           PDF writer and evidence pack
    i18n/               Languages and one locale file per language
    notice/             Notice generator
    scanner/            SSRF-safe fetcher, HTML analysis, tracker signatures, scoring
    audit.ts  otp.ts  rate-limit.ts  log.ts  validation.ts  constants.ts
  models/               Mongoose models
widget/src/widget.js    Consent banner (vanilla JS, Shadow DOM)
agent/                  Desktop agent (Go): detection, app matching, Windows and macOS integration, signed updates
extension/              Browser extension (MV3): detector port, paste/send checks, background reporting
tests/                  Vitest suites
```

Conventions: pages are server components that read data directly; mutations
are server actions in `features/*/actions.ts` returning `ActionState`; forms use
`useActionForm`. Every query is scoped by the signed-in organisation via
`requireAuth()` / `requireSite()`, and every mutation checks `can(role, permission)`.

## How the consent widget works

```html
<script src="https://yourdomain.com/widget.js" data-hp-site="SITE_KEY" async></script>

<!-- Trackers wait for consent: change type and add the purpose key -->
<script type="text/plain" data-hp-purpose="analytics" src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>
```

- Hidden until the site has a published notice; offers exactly the languages of that notice.
- Starts in the visitor's browser language when offered; otherwise the site's fallback language.
- Accept and reject have equal prominence; a floating button lets visitors change or withdraw consent later.
- With the age check on, under-18s get essentials only and a link for a parent; once the parent consents, the widget applies it on the child's next visit.
- Each decision is appended to the ledger with the notice version shown and a content hash. Records are never edited.
- Visitors are identified by a random ID in localStorage. IPs are stored only as salted hashes.
- API: `window.HighPre.open()`, `.getConsent()`, `.onChange(fn)`, `.setLanguage(code)`; event `highpre:consent`.

## Desktop agent

A small native program (Go, no dependencies, ~6 MB) that staff install on their
own computer from **Download agent** in the dashboard sidebar.

**How it works.** It watches the clipboard. When newly copied text contains a
password, API or private key, card number (Luhn-checked), bank account, Aadhaar
(Verhoeff-checked), PAN, passport number or a list of customer contacts, and an
AI assistant (ChatGPT, Claude, Gemini, Copilot, Perplexity, DeepSeek, Meta AI,
Grok, Le Chat), chat app (WhatsApp, Telegram, Slack, Discord, Teams) or paste site
comes to the front within two minutes, it:

1. shows the person a warning on their screen, and
2. reports `{dataType, app, occurredAt}` to HighPre, which emails the owners and lists it under **Desktop agent**.

**What stays on the device.** The copied text, any hash of it, window titles and
browsing history. Detection rules live in `agent/detect.go` and `agent/apps.go`.
The server only accepts known type and app keys and rejects requests with any
other field (`src/lib/agent/ingest.ts`); tests on both sides check this.

**Install.** Windows: run the `.exe`. It installs for the current user in
`%LOCALAPPDATA%\HighPre`, starts at sign-in, and appears in Settings → Apps for
removal. macOS: unzip and double-click *Install HighPre Agent.command*. It installs
in `~/Library/Application Support/HighPre` with a LaunchAgent; *Uninstall HighPre
Agent.command* removes it. Neither needs admin rights.

**Linking.** Every download carries its own device token (only its hash is
stored), so each laptop shows up separately and can be removed; a removed device
switches itself off on its next check-in. Downloads never installed are cleaned
up after 30 days.

**Building.** `npm run build:agent` (needs Go) or the Docker build compiles
Windows and macOS (Apple silicon and Intel) binaries into `agent/dist`, which the
download route reads. Without them the download says the agent isn't available.

**Before production.** Sign the Windows binary (Authenticode) and sign and notarise
the macOS binary with an Apple Developer ID; unsigned builds trigger SmartScreen
and Gatekeeper warnings. Tell your team what the agent does before rolling it out:
it's designed to be visible to the people it protects.

**Limits.** It sees the clipboard, not keystrokes, so text typed by hand isn't
detected, and it reacts to copied data being *available* while a risky app is in
front, not proof that it was pasted. The browser extension covers both.

### Browser extension (Chrome, Edge, Brave)

A Manifest V3 extension (`extension/`) that runs only on the AI, chat and paste
sites in `EXTENSION_SITES` (`src/lib/agent/catalog.ts`). It checks text as it is
**pasted, dropped or sent** (Enter or a Send button, so typed messages count),
using `extension/detect.js`, a port of the Go detector; both are tested against
`agent/testdata/detect_cases.json`. On a match it shows a dialog before the text
goes in: *Don't paste* / *Paste anyway* / *It isn't sensitive*, or, in block
mode, only a false-alarm report. The report is `{dataType, app, occurredAt,
source, outcome}`. Its only host permission is your HighPre server.

Each download is a zip built per person (manifest, config with a device token,
the watched-site list and icons generated on the server). Install it with
*Load unpacked*. For managed fleets, publish it to the Chrome Web Store /
Edge Add-ons as an unlisted item and force-install with the
`ExtensionInstallForcelist` policy; unpacked extensions don't update themselves.

### Settings per organisation

Owners and admins choose, on the Desktop agent page, which kinds of data to watch
for, which tools are approved (no warnings, e.g. a ChatGPT Enterprise workspace)
and whether the extension warns or blocks. Devices receive the policy with each
heartbeat (every 15 minutes) and keep the last one while offline; the server
also drops events the policy excludes. People can mark their own alerts as *not
sensitive*, and each data type shows its false-alarm rate over 90 days to help
tune the list. False alarms are recorded but not emailed.

### Company-wide install (MDM)

**Install across your company** (owners and admins) downloads a zip for Intune,
Jamf, Kandji and similar, with deployment steps inside:

- Windows: `HighPre-Agent-Company-Setup.exe --quiet`, deployed in the user's
  context; it installs per user like a personal download. Detection rule:
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\HighPreAgent`.
- macOS: `sudo ./install.sh` installs to `/Library/Application Support/HighPre`
  with a LaunchAgent for every user; `uninstall.sh` removes it.

Installers carry an enrolment key (`hpe_<org>.<version>.<hmac>`), derived from
`SESSION_SECRET` rather than stored. On first run each user's agent calls
`POST /api/agent/enroll` and receives its own device token; owners see the
computer name and sign-in name. Reinstalling reuses the device. A removed computer
gets `410` and stays off. **Replace key** retires every deployed installer
(enrolled computers keep working); **Turn off** stops new enrolments.

### Automatic updates

The Windows and personal macOS agents update themselves. `agent/build.mjs`
compiles in the public half of an Ed25519 key and signs each binary in
`agent/dist/manifest.json` (signature over platform, version and SHA-256). Agents
check `GET /api/agent/update` at start-up, every 6 hours and when a heartbeat
reports a newer version, download from `/api/agent/update/download`, and install
only if the signature verifies. A compromised server can't push unsigned code.
Builds made without a key never update.

```bash
node agent/build.mjs --generate-key > agent-update-key.pem   # once; keep it secret, back it up
AGENT_UPDATE_SIGNING_KEY_FILE=agent-update-key.pem npm run build:agent
docker build --secret id=agent_update_key,src=agent-update-key.pem .
```

Bump `Version` in `agent/main.go` for each release. Company installs on macOS
live in a root-owned folder and are updated by redeploying the package.

## Security notes

- Scanner blocks private/internal addresses at connect time (prevents SSRF and DNS rebinding), caps size, time and redirects.
- Rate limits are stored in MongoDB (atomic, TTL-expired), so they hold across instances; if the database is unreachable they fall back to per-process counters.
- Passwords use bcrypt (cost 12); sessions are HS256 JWTs in HttpOnly, SameSite=Lax cookies carrying a session version: changing or resetting a password, or "Sign out everywhere", invalidates every other session.
- Two-factor sign-in: TOTP (RFC 6238, SHA-1, 6 digits, ±1 step) on `node:crypto`; secrets are AES-256-GCM encrypted (key derived from `SESSION_SECRET`) and never selected by default; a used time step can't be replayed. After the password a 5-minute signed `hp_2fa` cookie (not a session) leads to the code step, rate-limited per user and per IP. Recovery codes are stored as SHA-256 hashes and removed on use. Turning 2FA on or off signs out other sessions, is logged in the activity log and emailed to the user. Password reset never signs anyone in.
- One-time codes are hashed, scoped to their flow (rights vs parental), expire in 10 minutes and lock after 5 wrong guesses.
- Razorpay checkout and webhooks are verified with HMAC-SHA256 in constant time; webhook events are idempotent.
- Content-Security-Policy, HSTS (production), frame and referrer headers are set in `next.config.mjs`.
- Consent records are hashed at write time; the evidence pack recomputes every hash and reports any record that changed.

## Known limitations

- The scanner reads static HTML; forms or trackers injected only by JavaScript can be missed.
- Parental consent is verified by email code plus a signed declaration. DPDP Rule 10 also allows verification against DigiLocker or government age tokens, which isn't integrated; consider it for high-risk services.
- Translations were drafted for HighPre and need review by native speakers; official renderings of the Act and Board names should be confirmed.
- The PDF evidence pack uses standard PDF fonts, so text in Indian scripts (for example translated purpose names) appears as "?". English content is unaffected.
- Emails to data principals are in English.
- The desktop agent's binaries are unsigned until you add code-signing certificates (see "Desktop agent").
