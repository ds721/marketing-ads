# Markit

An AI marketing employee for small local businesses — salons, restaurants, gyms,
bakeries, clinics, tuition centres.

> Tell us what's happening in your business. We'll figure out how to market it.

The owner types one sentence — *"Biryani + Coke combo for ₹199 this weekend"* —
and Markit classifies the intent, builds a campaign, writes platform-specific
content, renders a flyer, updates the calendar and waits for approval.

## Running it locally

Requires Node 20+ and PostgreSQL.

```bash
npm install
cp .env.example .env          # then fill in DATABASE_URL and the secrets below
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Generate the two required secrets:

```bash
echo "AUTH_SECRET=$(openssl rand -base64 32)"
echo "APP_ENCRYPTION_KEY=$(openssl rand -hex 32)"
```

Seeded logins (password `password123`):

| Account | Role |
| --- | --- |
| `priya@example.com` | Owner of Glow Salon (Growth plan) |
| `raj@example.com` | Owner of Spice House (Starter plan) |
| `admin@example.com` | Platform admin — `/admin` |

### Database

Any PostgreSQL works. For Supabase, use the pooled connection string as
`DATABASE_URL` and the direct one as `DIRECT_URL`, then add `directUrl` to the
datasource block in `prisma/schema.prisma` before migrating.

## What's real and what isn't

The product is built as a real SaaS, not a demo. Where an external service
isn't configured, the app says so rather than faking a result.

| Area | State |
| --- | --- |
| Auth, tenancy, RBAC, audit | Real |
| Business brain, strategy, campaigns, calendar | Real |
| AI generation | Real with `AI_PROVIDER=openai`; `mock` is a labelled dev stub |
| Flyer rendering | Real — deterministic SVG, no model involved |
| Video plans (Reels/Stories) | Real — shot lists, hooks and captions, schema-validated |
| Video watermarking & posters | Real via ffmpeg; says so plainly when ffmpeg is absent |
| Asset storage | Real on local disk; S3 driver is an interface, not implemented |
| Instagram publishing | Real: Instagram Login connect flow, token refresh, two-step Graph publish — needs your app (see "Connecting Instagram") |
| Facebook / WhatsApp / Google Business / LinkedIn | Listed as "Coming later"; no adapter yet |
| WhatsApp / Google Business / LinkedIn | Shown as "coming soon"; no adapter yet |
| Analytics | Schema and dashboard real; numbers appear once a platform is connected |
| Billing | Plans and entitlements enforced; no payment provider wired |

`AI_PROVIDER=mock` is the default so the product runs end to end without an API
key. Everything it produces is badged **Demo AI** in the interface.

## Architecture

```
src/
  app/                    routes — auth · /app/[tenant] · /admin · /[slug] (business pages)
  components/             UI primitives and forms
  lib/                    pure helpers (roles, formatting)
  server/
    tenant.ts             tenant isolation + RBAC — every tenant read goes through here
    ai/                   provider abstraction, model router, prompts, schemas
    marketing/            ideas → campaigns, strategy, content, insights
    creative/flyer.ts     deterministic text rendering
    creative/watermark.ts brand mark compositing
    creative/media.ts     ffmpeg probe, poster frames, video watermark
    social/               platform adapters
    jobs/                 Postgres-backed queue, worker, handlers
    storage/              storage drivers + upload validation
    site.ts               public business page loader + SEO metadata
    plans.ts usage.ts     entitlements; no limit is hardcoded elsewhere
```

### Three rules the code holds to

**Tenant isolation.** Every tenant-owned row carries `tenantId`. Pages and
actions call `requireTenant(slug, minRole)`, and the id used in queries comes
only from the membership row that returns — never from client input. Records
loaded by a client-supplied id go through `assertTenantOwns`.

**The AI never invents commercial facts.** Prices, dates, phone numbers and
addresses are extracted verbatim from the owner's words or left null. When a
promotion has no price, the product asks a question instead of guessing.

**Critical text is drawn, not generated.** An image model may only supply
background art. Prices and contact details are rendered by
`src/server/creative/flyer.ts` from stored facts, so ₹199 cannot drift.

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

115 tests cover tenant isolation, role permissions, AI schema validation and the
anti-invention guardrails, token encryption, upload sniffing, plan limits, form
input handling, video planning, brand watermarking, route-collision safety,
OAuth state forgery, admin revenue rules, and the full "one sentence →
reviewable campaign" scenario.

Video tests that need ffmpeg skip themselves where it isn't installed.

## Connecting Instagram

Markit connects Instagram directly through **Instagram Login** — the owner
taps Connect, approves on Instagram, done. No Facebook Page, no Facebook
account. We never see a password; we store a 60-day token, encrypted, and
renew it automatically before it lapses.

### One-time: create the app (you, the platform operator — ~15 min)

1. https://developers.facebook.com/apps → **Create App** → use case *Other* → type **Business**.
2. On the dashboard, add the **Instagram** product.
3. Open **Instagram → API setup with Instagram login**. Two things live here:
   - **Instagram App ID** and **Instagram App Secret** — copy these into `.env`
     as `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`. (Not the Facebook App ID
     at the top of the dashboard — the Instagram-specific ones on this page.)
   - **Business login settings → OAuth redirect URIs** — add
     `https://your-domain.com/api/social/instagram/callback`
     (and `http://localhost:3000/api/social/instagram/callback` for development).
4. Restart the server. `/admin` → *Platform setup* shows **Instagram publishing: Clients can connect**.

### While the app is in Development mode

Only Instagram accounts you've added as testers can connect. On the same
*API setup* page, **Add or remove Instagram testers** → enter their username.
They accept in the Instagram app: *Settings → Website permissions → Tester invites*.

### Go public: App Review

**Instagram → App Review → Permissions and features** → request
`instagram_business_basic` and `instagram_business_content_publish`. Meta asks
for a screen recording of the connect flow and a post going out. Approval
takes 1–3 weeks; start it as soon as the flow works for one tester. Once
approved, switch the app to **Live** and any owner can connect.

### What the business owner needs

One thing: an Instagram **Business or Creator** account. Instagram does not
allow any app to post to a Personal account. Switching is free and takes 30
seconds in the Instagram app (*Settings → Account type and tools → Switch to
professional account*). The Integrations page says this before they click
Connect, and the callback refuses a Personal account with the same
explanation rather than storing a token that can never publish.

### How publishing works

Instagram fetches a post's image from a URL. The tenant's asset library is
private, so the worker mints a signed link (`/api/public-assets/{id}?exp&sig`)
valid for one hour and for that one asset only, and hands it to Instagram.
Nothing else in the library is reachable.

### How the flow protects tenants

`/api/social/instagram/start` checks the caller is an admin of the tenant,
that Instagram is configured, and that the plan has headroom, then signs a
state token bound to that tenant. `/api/social/instagram/callback` verifies
the signature and a matching cookie, re-checks admin membership, and only
then exchanges the code. `tests/instagram.test.ts` covers forgery, expiry,
Personal-account refusal and asset-link tampering.

### Facebook, WhatsApp, Google Business, LinkedIn

Later. They're listed on the Integrations page as *Coming later* so owners
aren't misled. Markit still writes and plans content for them; the owner
posts it manually until an adapter exists.

## Flyers

**The AI is the art director; the app is the press.** For each offer the
model proposes several distinct design directions as a validated spec —
palette, background, shapes, typography, layout, photo treatment, price
style (`designSpecSchema`) — and `design-renderer.ts` draws them. The owner
picks from real previews in their own colours, with a live preview as they
type, and can ask for more directions or redesign later. The model never
writes a word onto the flyer: text is placed by the renderer from the
locked facts, and it corrects the model's colour choices if contrast would
make text unreadable. With an image key, a design can also request a
painted background scene (no text) and the model supplies it.

Six hand-made looks remain as the brand default and the demo-mode fallback.

Text is drawn as vector outlines from seven bundled OFL fonts
(`public/fonts`), so flyers are identical on every machine and no server
font setup is needed. Widths are measured, not estimated. Decorative motifs
follow the business category. Prices, dates and contact details are placed
by this code — never by an image model (§19).

With an OpenAI key, "Make a photo" generates a product image from a
description; the model only draws the scene, text is still laid on
afterwards.

## Video

Reels are how most people find local businesses now, but a shop owner can't
produce a studio video. So Markit produces what they can act on: a shootable
plan — a hook, a timed shot list, what to say, and the caption. Owners upload
clips they already have, and any video can carry the brand mark.

Watermarking (logo image or text, position and strength configurable) is
composited into flyers as SVG and burned into videos with ffmpeg. Originals are
never overwritten — a branded copy is stored alongside, so changing the logo and
re-running is safe.

ffmpeg is an optional host dependency. Without it, uploads and every other
feature still work; the app says plainly that video branding is unavailable
rather than skipping the mark silently.

```bash
brew install ffmpeg    # macOS
apt install ffmpeg     # Debian/Ubuntu
```

## Background jobs

Scheduled publishing runs through a Postgres-backed queue with atomic claiming,
exponential backoff and a dead-letter state. In development an in-process worker
polls every 30s (`JOBS_ENABLED=true`). In production, drive the same tick from a
cron or worker process:

```bash
curl -X POST https://your-host/api/jobs/tick -H "Authorization: Bearer $JOBS_TICK_SECRET"
```

## Public business pages

Everything runs on one domain. Each business's public page is its slug at the
root:

```
markit.app/glow-salon
markit.app/spice-house
```

Each page carries SEO metadata, Open Graph tags, LocalBusiness JSON-LD, a
canonical URL and a sitemap entry. `/site/{slug}` permanently redirects to the
new address so older links keep working.

Because business pages sit at the root, a slug must never shadow a platform
route. `src/lib/reserved-slugs.ts` is the single list, enforced when a tenant is
created — and a test walks every top-level directory under `src/app` and fails
if a route exists that isn't reserved, so adding a route without reserving its
name can't slip through.
