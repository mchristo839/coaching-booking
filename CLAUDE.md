# MyCoachingAssistant - Claude Code Context

## What this project is

A multi-coach WhatsApp bot platform. Coaches sign up, create programmes, and their WhatsApp group gets an AI-powered assistant that answers parent questions using the programme's knowledgebase.

First live coach: Paul (coach ID `481181c9`, programme ID `89557f36`, group `120363422695360945@g.us`).

## Working rules for Claude Code

1. **One task per session.** Don't wander across features. If a task spec says "Create Program page", do only that.
2. **Plan first.** Before writing code, read the relevant files, then propose a plan and list open questions. Wait for confirmation before implementing.
3. **Branch per feature.** `git checkout -b feat/<task-name>`. Never commit to main directly.
4. **Test on Paul's group.** Every feature gets tested with the live bot before merging. Paul's group is the staging environment.
5. **Update this file.** After every feature ships, update the relevant section here.
6. **British spelling.** `programmes` not `programs`, `register` not `signup` in routes.
7. **No new dependencies without asking.** If you think a package is needed, explain why first.
8. **Keep responses short.** WhatsApp messages from the bot max out at 300 tokens for a reason.

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router, TypeScript) |
| Database | Neon Postgres via Vercel Postgres (`@vercel/postgres`, tagged template literals) |
| Auth | localStorage-based (bcryptjs password hashing) |
| AI | Claude Haiku 4.5 via Anthropic API (raw fetch) |
| WhatsApp | Evolution API v2 (Baileys-based) |
| Hosting | Vercel Hobby (app) + Contabo VPS (Evolution API + cron) |
| Styling | Tailwind CSS |

## Infrastructure

| Component | Location |
|-----------|----------|
| Next.js app | https://coaching-booking-v3.vercel.app |
| Evolution API | http://161.97.176.176:8080 |
| Evolution Manager UI | http://161.97.176.176:8080/manager |
| Neon Postgres | Vercel-managed connection |
| GitHub repo | mchristo839/coaching-booking |
| Ops cron | Contabo VPS via `/ops/contabo/` scripts |

## Environment variables

| Variable | Description | Used in |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Claude API key | webhook handler, health check |
| `EVOLUTION_API_URL` | `http://161.97.176.176:8080` | evolution.ts, health check |
| `EVOLUTION_API_KEY` | Evolution API auth key | evolution.ts, health check |
| `EVOLUTION_INSTANCE` | `paul-bot` | evolution.ts, health check |
| `POSTGRES_URL` | Neon connection string | auto-injected by Vercel |
| `NEXT_PUBLIC_APP_URL` | Public app URL | admin invites page |
| `TELEGRAM_BOT_TOKEN` | Telegram bot for ops alerts | alerts.ts |
| `TELEGRAM_CHAT_ID` | `1412433866` (Mario's personal chat) | alerts.ts |
| `MCA_ALERT_PREFIX` | `[MCA]` prefix for alert messages | alerts.ts |
| `HEALTH_CHECK_SECRET` | Bearer token for health/maintenance endpoints | health, cleanup, smoke-test |
| `ADMIN_EMAIL` | Mario's email for admin access | admin invites API |

## Project structure (actual)

```
app/
├── api/
│   ├── auth/login/            # POST — bcrypt login, returns JSON
│   ├── auth/signup/            # POST — bcrypt signup with invite code validation
│   ├── admin/invites/          # GET/POST — invite code management (admin-only)
│   ├── programs/create/        # POST — create programme
│   ├── programs/list/          # GET — list programmes by coach
│   ├── programs/update/        # PATCH — update programme
│   ├── webhooks/whatsapp/      # POST — main bot handler (Evolution API webhook)
│   ├── health/                 # GET — ops health check with 6 checks + alerting
│   ├── maintenance/cleanup/    # POST — purge stale processed_messages
│   ├── dev/smoke-test/         # POST — self-test for conversation/dedup systems
│   └── db-migrate/             # POST — idempotent migration runner
│
├── admin/invites/              # admin page: generate + manage invite codes
├── auth/login/                 # login page
├── auth/signup/                # signup page (requires invite code during beta)
├── components/
│   └── ProgrammeForm.tsx       # shared form used by create + edit
├── dashboard/
│   ├── page.tsx                # main dashboard
│   ├── programmes/new/         # dedicated create programme page
│   ├── programs/               # programme list + edit
│   └── settings/               # bot setup help page
│
├── lib/
│   ├── alerts.ts               # Telegram alert dispatcher with dedup
│   ├── db.ts                   # ~15 DB functions (coaches, programs, conversations, dedup, invites)
│   ├── evolution.ts            # WhatsApp message sender
│   └── health-checks.ts        # 6 health checks (Evolution, Postgres, Anthropic, staleness, escalations, duplicates)
│
└── layout.tsx, page.tsx        # root layout and home page

ops/contabo/                    # Contabo VPS cron scripts (health check, cleanup)
docs/                           # Audit reports and task specs
```

## Database tables (actual)

| Table | Purpose | Status |
|-------|---------|--------|
| `coaches` | Coach accounts (id, email, name, password_hash, invite_code, is_tester) | Active |
| `programs` | Programme config with JSONB knowledgebase, whatsapp_group_id | Active |
| `conversations` | Message log (sender, text, bot_response, category, escalated) | Active (populated by webhook) |
| `bot_replies` | Reply tracking for duplicate detection | Active |
| `processed_messages` | Message ID dedup (24h TTL) | Active |
| `alert_log` | Telegram alert dedup (30min window) | Active |
| `health_state` | Health check state tracking (consecutive failures) | Active |
| `invite_codes` | Beta invite codes (code, max_uses, uses, expires_at) | Active |

## Bot behaviour

- Responds to **all group messages** (no @mention filtering yet)
- Classifies messages into: `question`, `social`, `escalation`, `general`
- Escalation keywords trigger `escalated=true` flag (injury, complaint, safeguard, etc.)
- Every message + bot response logged to `conversations` table
- Duplicate webhook calls deduped via `processed_messages` table
- Duplicate bot replies prevented via `bot_replies` 10-second window check

## PLANNED (not yet implemented)

- @mention-only mode (bot only responds when @mentioned)
- Member/parent signup system (`members` table)
- FAQ learning from coach responses (`faqs` table)
- Escalation acknowledgement (coach replies mark `escalation_acked_at`)
- DM signup flow (`signup_sessions` table)
- JWT/cookie auth (replacing localStorage)
- Observation mode (bot watches but doesn't reply)
- `whatsapp_bot_status` on coaches (live/observation/paused)

## Known quirks (read before debugging)

- **Bot disconnects** — `paul-bot` periodically hits `device_removed`. Requires manual QR re-scan via Evolution Manager. Health endpoint detects this.
- **`pushName` quirks** — Evolution API sometimes sends LIDs instead of display names. Falls back to "there".
- **evolution.ts default URL** — Still has old GCP IP as fallback. Env var overrides it in production.
- **Vercel Hobby tier** — No server-side cron. Health monitoring runs from Contabo VPS.

## Common operations

```bash
# Check bot connection
curl -s http://161.97.176.176:8080/instance/connectionState/paul-bot \
  -H "apikey: $EVOLUTION_API_KEY"

# Reconnect bot (get QR)
curl -s http://161.97.176.176:8080/instance/connect/paul-bot \
  -H "apikey: $EVOLUTION_API_KEY"

# Run health check
curl -s https://coaching-booking-v3.vercel.app/api/health \
  -H "Authorization: Bearer $HEALTH_CHECK_SECRET"

# Run migration
curl -X POST https://coaching-booking-v3.vercel.app/api/db-migrate

# Run cleanup
curl -X POST https://coaching-booking-v3.vercel.app/api/maintenance/cleanup \
  -H "Authorization: Bearer $HEALTH_CHECK_SECRET"

# Deploy
npx vercel deploy --prod
```

## What's currently broken / in progress

See the open task specs in `/docs/tasks/`.
