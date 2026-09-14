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
| Asset storage | Real on local disk; S3 driver is an interface, not implemented |
| Publishing | Real Meta Graph adapter — needs an approved Meta app to connect |
| WhatsApp / Google Business / LinkedIn | Shown as "coming soon"; no adapter yet |
| Analytics | Schema and dashboard real; numbers appear once a platform is connected |
| Billing | Plans and entitlements enforced; no payment provider wired |

`AI_PROVIDER=mock` is the default so the product runs end to end without an API
key. Everything it produces is badged **Demo AI** in the interface.

## Architecture

```
src/
  app/                    routes — (auth) · /app/[tenant] · /admin · /site/[slug]
  components/             UI primitives and forms
  lib/                    pure helpers (roles, formatting)
  server/
    tenant.ts             tenant isolation + RBAC — every tenant read goes through here
    ai/                   provider abstraction, model router, prompts, schemas
    marketing/            ideas → campaigns, strategy, content, insights
    creative/flyer.ts     deterministic text rendering
    social/               platform adapters
    jobs/                 Postgres-backed queue, worker, handlers
    storage/              storage drivers + upload validation
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

41 tests cover tenant isolation, role permissions, AI schema validation and the
anti-invention guardrails, token encryption, upload sniffing, plan limits, and
the full "one sentence → reviewable campaign" scenario.

## Background jobs

Scheduled publishing runs through a Postgres-backed queue with atomic claiming,
exponential backoff and a dead-letter state. In development an in-process worker
polls every 30s (`JOBS_ENABLED=true`). In production, drive the same tick from a
cron or worker process:

```bash
curl -X POST https://your-host/api/jobs/tick -H "Authorization: Bearer $JOBS_TICK_SECRET"
```

## Public tenant sites

Each business gets a public page at `/site/{slug}` with SEO metadata, Open Graph
tags, LocalBusiness JSON-LD and a sitemap entry. With a wildcard DNS record the
middleware serves the same page at `{slug}.yourdomain.com`.
