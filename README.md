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
| Publishing | Real: Meta OAuth connect flow + Graph publishing — needs your Meta app (see "Connecting Instagram") |
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

95 tests cover tenant isolation, role permissions, AI schema validation and the
anti-invention guardrails, token encryption, upload sniffing, plan limits, form
input handling, video planning, brand watermarking, route-collision safety,
OAuth state forgery, admin revenue rules, and the full "one sentence →
reviewable campaign" scenario.

Video tests that need ffmpeg skip themselves where it isn't installed.

## Connecting Instagram

Instagram and Facebook connect through one Meta app, via Facebook Login. No
passwords pass through Markit; the owner consents on Facebook's own page and we
store the resulting Page token encrypted.

### One-time: create the Meta app (you, the platform operator)

1. Go to https://developers.facebook.com/apps → **Create App** → type **Business**.
2. Add the **Facebook Login for Business** product.
3. Under *Facebook Login → Settings*, add the redirect URI:
   ```
   https://your-domain.com/api/social/meta/callback
   ```
   (and `http://localhost:3000/api/social/meta/callback` for development).
4. Copy **App ID** and **App Secret** into `.env` as `META_APP_ID` / `META_APP_SECRET`.
5. Submit for **App Review** requesting these permissions:
   `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`,
   `instagram_basic`, `instagram_content_publish`, `business_management`.

   Until review passes, the app is in Development mode and only people you add
   as testers in the Meta dashboard can connect. Review typically takes 1–3
   weeks and requires a screencast of the flow — start it early.

### Every time: what a business owner needs (their side)

- An Instagram **Business or Creator** account — Instagram does not allow any
  app to post to a Personal account.
- A **Facebook Page** they administer, linked to that Instagram account
  (Instagram app → Settings → Business tools → Connect a Facebook Page).

Then: Integrations → **Connect** → approve on Facebook → done. Connecting
Facebook also connects every Instagram account linked to those Pages. Tokens
are long-lived Page tokens and do not expire on a schedule; if Meta invalidates
one (password change, permission removed), the account shows **Needs
reconnecting** and scheduled posts to it pause instead of failing silently.

### How the flow protects tenants

`/api/social/{provider}/start` checks the caller is an admin of the tenant,
that the plan has headroom for another account, and signs a state token bound
to that tenant. `/api/social/meta/callback` verifies the signature and a
matching cookie, re-checks admin membership, and only then exchanges the code.
A forged callback cannot attach an account to a business the caller doesn't
control — `tests/oauth.test.ts` covers this.

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
