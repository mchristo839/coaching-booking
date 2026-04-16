# MyCoachingAssistant - Claude Code Context

## What this project is

A multi-coach WhatsApp bot platform. Coaches sign up, create programmes, and their WhatsApp group gets an AI-powered assistant that answers parent questions, handles signups, learns from coach responses, and escalates sensitive issues.

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
| Database | Neon Postgres via Vercel Postgres |
| Auth | JWT with HTTP-only cookies (jose library) |
| AI | Claude Haiku 4.5 via Anthropic API |
| WhatsApp | Evolution API v2 (Baileys-based) |
| Hosting | Vercel (app) + Contabo VPS (Evolution API) |
| Styling | Tailwind CSS |

## Infrastructure

| Component | Location |
|-----------|----------|
| Next.js app | https://coaching-booking-v3.vercel.app |
| Evolution API | http://161.97.176.176:8080 |
| Evolution Manager UI | http://161.97.176.176:8080/manager |
| Neon Postgres | Vercel-managed connection |
| GitHub repo | mchristo839/coaching-booking |

## Environment variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key |
| `EVOLUTION_API_URL` | `http://161.97.176.176:8080` |
| `EVOLUTION_API_KEY` | Evolution API auth key |
| `EVOLUTION_INSTANCE` | `paul-bot` |
| `BOT_JID` | `447458164754@s.whatsapp.net` |
| `JWT_SECRET` | JWT signing secret |
| `POSTGRES_URL` | Neon connection string |
| `NEXT_PUBLIC_APP_URL` | Public app URL |
| `TELEGRAM_BOT_TOKEN` | EA Telegram bot token (reused for MCA ops alerts) |
| `TELEGRAM_CHAT_ID` | `1412433866` (Mario's personal chat) |
| `MCA_ALERT_PREFIX` | `[MCA]` — prepended to every MCA alert to distinguish from EA digest |
| `HEALTH_CHECK_SECRET` | Bearer token for health endpoint (to be added) |

## Project structure

```
app/
├── api/
│   ├── auth/              # login, logout, register, verify-email
│   ├── coaches/           # coach profile CRUD
│   ├── members/           # member list and signup
│   ├── programmes/        # programme CRUD (create, list, update, public)
│   ├── faqs/              # FAQ CRUD + approval
│   ├── dashboard/         # stats
│   ├── webhooks/whatsapp/ # the main bot route
│   ├── health/            # (to be built) ops health endpoint
│   └── db-migrate/        # migration runner
│
├── auth/login/            # login page
├── register/              # 5-stage registration wizard
├── join/[id]/             # public programme signup
├── dashboard/
│   ├── programmes/        # programme management
│   ├── members/           # member list
│   ├── learning/          # FAQ approval queue
│   └── settings/          # bot setup
│
└── lib/
    ├── auth.ts            # JWT helpers
    ├── db.ts              # db functions (40+)
    └── evolution.ts       # WhatsApp sender
```

## Database schema quick reference

- `providers` — business accounts
- `coaches_v2` — coach profiles, includes `whatsapp_bot_status` (`live` | `observation` | `paused`)
- `programmes` — full programme config with schedule, venue, pricing, capacity
- `members` — parents/players, `status` is `active` | `trial` | `waitlisted` | `cancelled`
- `faqs` — knowledge base, `source` is `coach` | `preloaded` | `learned`, `status` is `active` | `pending_coach_approval`
- `conversations` — full message log with bot response, category, escalation
- `bot_replies` — rate limiting
- `signup_sessions` — DM signup state machine

## Known quirks (read before debugging)

- **WhatsApp LIDs** — Groups show Linked Identities like `@165722051334265` instead of phone numbers. The bot has 5 fallback detection strategies for @mentions.
- **Bot disconnects** — `paul-bot` periodically hits `device_removed`. Requires manual QR re-scan via Evolution Manager. This is the #1 thing the health endpoint needs to catch.
- **`pushName` quirks** — Evolution API sometimes sends LIDs instead of display names. Falls back to "there".
- **Vercel Postgres** — Uses `sql.query()` everywhere, not tagged templates, to avoid stale read replica issues.

## Common operations

```bash
# Check bot connection
curl -s http://161.97.176.176:8080/instance/connectionState/paul-bot \
  -H "apikey: $EVOLUTION_API_KEY"

# Reconnect bot (get QR)
curl -s http://161.97.176.176:8080/instance/connect/paul-bot \
  -H "apikey: $EVOLUTION_API_KEY"

# Send test message
curl -s -X POST http://161.97.176.176:8080/message/sendText/paul-bot \
  -H "apikey: $EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"number": "GROUP_JID@g.us", "text": "Test"}'

# Run migration
curl https://coaching-booking-v3.vercel.app/api/db-migrate

# Deploy
npx vercel deploy --prod
```

## What's currently broken / in progress

See the open task specs in `/docs/tasks/`.
