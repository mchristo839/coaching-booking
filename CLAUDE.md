# CoachBook Platform - Claude Code Context

Multi-coach WhatsApp bot platform. Coaches sign up, create programmes with a knowledgebase, link a WhatsApp group, and get an AI assistant that answers parent questions automatically.

---

## Repo Structure

```
app/
  api/
    auth/login/route.ts          ← Coach login (JWT cookie)
    auth/signup/route.ts         ← Coach signup (JWT cookie)
    auth/logout/route.ts         ← Clear auth cookie
    programs/create/route.ts     ← Create programme (JWT-protected)
    programs/list/route.ts       ← List programmes (JWT-protected)
    programs/update/route.ts     ← Update programme (JWT-protected, ownership check)
    coach/whatsapp-jid/route.ts  ← Set coach WhatsApp number (JWT-protected)
    webhooks/whatsapp/route.ts   ← Evolution API webhook (signature-verified)
    db-migrate/route.ts          ← One-time DB migrations
  lib/
    db.ts                        ← All Postgres queries
    auth.ts                      ← JWT helpers (sign, verify, cookie)
    evolution.ts                 ← WhatsApp message sending via Evolution API
  dashboard/
    page.tsx                     ← Coach dashboard
    programs/page.tsx            ← Programme CRUD
    settings/page.tsx            ← Bot settings + WhatsApp JID
  auth/
    login/page.tsx               ← Login form
    signup/page.tsx              ← Signup form
  page.tsx                       ← Landing page
CLAUDE.md                        ← This file
```

---

## Infrastructure

| Component | Location |
|-----------|----------|
| Next.js app | Vercel (https://coaching-booking-v3.vercel.app) |
| Database | Neon Postgres (via @vercel/postgres) |
| WhatsApp gateway | Evolution API on GCP (35.239.224.242:8080) |
| Evolution Manager | http://35.239.224.242:8080/manager |

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `POSTGRES_*` | Neon Postgres connection (auto-set by Vercel) |
| `JWT_SECRET` | Signs auth cookies |
| `ANTHROPIC_API_KEY` | Claude API for bot responses |
| `EVOLUTION_API_URL` | Evolution API base URL |
| `EVOLUTION_API_KEY` | Evolution API auth key |
| `EVOLUTION_INSTANCE` | WhatsApp instance name (e.g. paul-bot) |
| `EVOLUTION_WEBHOOK_SECRET` | HMAC secret for webhook signature verification |
| `BOT_JID` | Bot's WhatsApp JID (e.g. 447458164754@s.whatsapp.net) |

---

## Database Schema

```sql
coaches (id UUID PK, email, name, password_hash, whatsapp_jid, created_at)
programs (id UUID PK, coach_id FK, program_name, whatsapp_group_id, knowledgebase JSONB, is_active, created_at)
bot_replies (id UUID PK, group_jid, reply_type, sent_at)  -- rate-limits auto-replies
message_log (id UUID PK, program_id, group_jid, sender_jid, sender_name, message_text, is_from_coach, is_from_bot, created_at)
```

Knowledgebase JSONB: sport, venue, venueAddress, ageGroup, skillLevel, schedule, priceCents, whatToBring, cancellationPolicy, medicalInfo, coachBio, customFaqs[{q, a}]

---

## Auth

JWT in HTTP-only cookie (`auth_token`). Set on login/signup, cleared on logout. All `/api/programs/*` and `/api/coach/*` routes verify JWT and extract coachId server-side. Client localStorage stores `coachName` for display only.

---

## Bot Message Flow

1. Message arrives in WhatsApp group
2. Evolution API fires webhook to `/api/webhooks/whatsapp`
3. Webhook verifies HMAC signature (x-evox-signature header)
4. Extracts message text, group JID, sender JID
5. Looks up programme by `whatsapp_group_id` in Postgres
6. If unlinked group or no knowledgebase: sends rate-limited auto-reply (max 1/hour)
7. Logs message to `message_log`
8. If sender is the coach: triggers auto-learning (extracts Q&A pairs silently)
9. If bot is @mentioned: builds Claude prompt with knowledgebase + recent conversation context, sends reply
10. Logs bot reply to `message_log`

---

## Bot Learning

The bot learns from coach responses:
- All messages logged to `message_log` per group
- When a coach answers a question, Claude extracts the Q&A pair and appends it to `knowledgebase.customFaqs`
- Coach can send `!learn` to batch-extract from recent messages
- Recent messages (last 15) included as conversation context so bot has memory

---

## Test Coach: Paul

| Field | Value |
|-------|-------|
| Coach ID | 481181c9-ba2b-4eeb-8159-b975c8e628f7 |
| Program ID | 89557f36 |
| WhatsApp group | 120363422695360945@g.us |
| Bot phone | +447458164754 |

---

## Common Tasks

**Reconnect WhatsApp:**
```bash
curl -s http://35.239.224.242:8080/instance/connect/paul-bot \
  -H "apikey: $EVOLUTION_API_KEY" | jq .
```

**Run DB migration (after deploy):**
```bash
curl -X POST https://coaching-booking-v3.vercel.app/api/db-migrate
```
