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
9. **Follow the design system.** Before writing or changing any UI, read `DESIGN.md` — it is the single source of truth for colours, type, spacing, and motion. Use the named Tailwind tokens (`brand-*`, `ink`, `canvas`, `line`, `.btn-primary`, `.input-field`, etc.), never ad-hoc hex or stray colours. Keep every page consistent. Skills live in `.claude/skills/`: `design-intake`, `web-design-system`, `copywriting`, `special-effects`. If asked to change the look/branding, run `design-intake` and update `DESIGN.md`.

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router, TypeScript) |
| Database | Self-hosted **Postgres on Contabo VPS** via the standard `pg` driver (`app/lib/sql.ts` shim; tagged template literals). Migrated off Neon. |
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
| Postgres | Self-hosted on Contabo VPS (standard TCP, self-signed SSL) |
| GitHub repo | mchristo839/coaching-booking |
| Ops cron | Contabo VPS via `/ops/contabo/` scripts |

## Environment variables

| Variable | Description | Used in |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Claude API key | webhook handler, health check |
| `EVOLUTION_API_URL` | `http://161.97.176.176:8080` | evolution.ts, health check |
| `EVOLUTION_API_KEY` | Evolution API auth key | evolution.ts, health check |
| `EVOLUTION_INSTANCE` | `paul-bot` | evolution.ts, health check |
| `POSTGRES_URL` | Contabo Postgres connection string (`pg` shim reads this / `DATABASE_URL`) | sql.ts |
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

- **Closed intent set** — the group bot answers ONLY a defined list of intents, all from programme data: location, price, payment, duration, session type, holiday camps, age range, what to bring, capacity/booking. Everything else is refused-and-routed. See `app/lib/bot-intent.ts`.
- **Wide recognition, narrow answers** — an LLM classifier (`classifyBotIntent`) maps loose/casual phrasings onto the closed set; a deterministic gate (`planBotResponse`) decides answer-vs-route in code, so the two guarantees hold regardless of the LLM:
  1. **Never answers out-of-scope** (incl. general-knowledge/fitness advice) — routes to the coach.
  2. **Never guesses inside scope** — if the backing field is empty, routes to the coach instead of inventing.
- **Capacity/booking** uses a live check (`getProgrammeAvailability`): coach-set `programme_status` overrides, else `max_capacity` vs active `members` count.
- **Real handoff** — out-of-scope/missing-data DMs the coach via `notifyCoachHandoff` (`notify.ts`) AND posts a routing line in the group. Social chatter (greetings/thanks) gets no reply.
- Answers are phrased by a second LLM call (`phraseAnswer`) scoped to ONLY the resolved field — defence-in-depth so it can't add outside knowledge.
- Responds to all group messages (no @mention filtering yet); the keyword classifier still sets the `escalated` flag (injury, complaint, safeguard) for logging.
- Every message + bot response logged to `conversations` table
- Duplicate webhook calls deduped via `processed_messages` table
- Duplicate bot replies prevented via `bot_replies` 10-second window check
- **STOP/UNSUBSCRIBE** in a 1:1 sets `members.marketing_opt_out` (highest-priority 1:1 branch) — member is then excluded from referral DMs

## Referral DMs to individual members

Coaches can DM a refer-a-friend promotion's link to selected members (not just
the group), from the promotion detail page (`/dashboard/promotions/[id]`).

- `GET /api/promotions/[id]/members` — active, contactable members across the promotion's target programmes (deduped by JID; LID-only members excluded since you can't DM a `@lid`)
- `POST /api/promotions/[id]/send-dm` — DMs the link to selected member IDs; refer-a-friend only
- Each DM appends a **"Reply STOP to opt out."** footer and rewrites the link to `/refer/<slug>?ref=<memberId>` so the public page pre-attributes the referral to that member
- Opt-out (`members.marketing_opt_out` / `marketing_opt_out_at`) is checked before sending and honoured on STOP
- Sends are paced (~600ms apart) to reduce WhatsApp ban risk on the Baileys stack
- Compliance: only signed-up members are messaged (PECR soft opt-in), never harvested group rosters

## Holiday camp 1:1 booking conversation

A WhatsApp 1:1 state machine that books a child onto a holiday-camp promotion.
Engine: `app/lib/camp-booking.ts` (`tryHandleCampBookingReply`, wired into the
webhook's 1:1 branch); message copy + pure parsers in `app/lib/ai-messages.ts`.

- **Flow** (`conversation_step` on `camp_bookings`): `awaiting_parent_name → awaiting_child_name → awaiting_child_age → awaiting_day_selection → awaiting_checkout_confirm → awaiting_payment → awaiting_coach_confirm → confirmed` (+ `awaiting_waitlist_confirm`, `cancelled`). The coarse `state` column is kept in sync for the dashboard/confirm queries.
- **Capacity is DERIVED, never stored**: `remaining = day.capacity − count(confirmed bookings incl. that day)`. Full days are excluded at selection and re-checked at checkout; capacity only drops on **coach confirm** (`getCampDayAvailability`).
- **Multiple children, one payment**: sibling rows share a `booking_group_id`; checkout/payment/confirm operate on the whole group. One row per child so each consumes day capacity.
- **Coach confirm** (`/api/promotions/[id]/bookings/[bookingId]/confirm`) → confirms the group, sets linked `members.status = 'active'`, sends the parent the "All booked ✓" message (Message 8). **Reject** (`…/reject`) keeps the booking pending and DMs the parent.
- **Coach confirm over WhatsApp too**: on parent "done", the coach is DM'd a YES/NO request (`requestCoachPaymentConfirm` — native buttons with a text fallback). The coach replying YES/NO (button id or text, matched by last-9 phone digits) runs `tryHandleCoachCampConfirm` → same confirm/reject logic. Wired highest-priority in the webhook 1:1 branch; button taps are captured into `inboundText`.
- **Dashboard** (`/dashboard/promotions/[id]`): day-by-day availability panel (colour-coded), pending confirmations with one-click Confirm/Reject, CSV export of confirmed bookings.
- New `camp_bookings` columns: `conversation_step`, `child_age`, `booking_group_id`, `payment_link`, `payment_status`, `programme_id`, `parent_email`, `parent_phone`, `payment_link_sent_at`, `thankyou_sent_at`, `parent_chase_step`, `coach_chase_step`.
- **Sign-up before payment**: after checkout-confirm, the flow collects parent full name → email → phone (`awaiting_reg_name/email/phone`), then **registers a `members` row per child** (status `trial`, linked to the programme) so the family shows on the Members page, then sends the payment link.
- **Thank-you / payment-received follow-up** is a WhatsApp message (`buildCampPaymentReceived`, itemised) sent the moment the parent replies "done"/paid. (Email was dropped — the WhatsApp follow-up is preferred; the parent's email is still collected onto the member record for the coach's records.)
- **24h chase ladders** (`runCampChase`, wired into the `payment-chase` cron): nudges the **parent** if the link is unpaid (+24h/+48h), and reminds the **coach** (via `getInternalRecipients`) + reassures the parent if a reported payment sits unconfirmed (+24h/+48h).
- **Unified builder** (`/dashboard/camps/new` → `POST /api/camps`): one screen — description + optional image (base64, sent via `sendWhatsAppMedia`) + bookable days (price/capacity) + poll options. On save it creates the holiday_camp promotion AND creates + posts the linked poll to the chosen groups in one go. The old `/dashboard/promotions/new` holiday_camp path still works and links across to this builder.
- **Two ways to start it (both supported)**:
  1. **Cohort blast** — `send-camp-cohort` DMs every parent on the targeted programmes' member roll (details known → starts at day selection).
  2. **Poll YES** — a poll can be linked to a camp via `polls.promotion_id` (set from the poll builder's "Link to a holiday camp" dropdown). A YES vote calls `startCampBookingFromPoll` (idempotent), which opens a booking and sends Message 1 (asks for parent name first if unknown, else child name). Wired into both the native-poll and text-vote paths in the webhook.
  3. **Group enquiry** (Route 2) — when a live camp exists for the group (`getActiveCampForProgramme`), the closed-intent bot offers a booking after answering an in-scope question ("reply *yes*", tracked in `camp_offers`); a `capacity_booking` intent ("can I book") starts it directly. Both call `startCampBookingFromPoll` and DM the parent.

## FAQ learning (coach-approved, per-programme)

`app/lib/faq-learning.ts`. Two halves, both scoped to a single `programme_id` (FAQs are never shared across programmes/coaches):
- **Bot answers from approved FAQs**: when the closed-intent gate can't answer, `matchActiveFaq` checks the programme's `kb.customFaqs` (active FAQs) — if one matches, the bot answers from it (phrased scoped to that answer only). FAQs fill the long tail the structured fields don't cover.
- **Suggestions from chats**: `suggestFaqsForProgramme` reads that programme's `conversations` log and drafts durable Q&A as `faqs` rows with `status='pending_coach_approval'`, `source='learned'`. It **excludes one-off/time-bound answers** ("this week", dates, "normally X but…") so exceptions aren't learned as standing facts. Triggered by the **"Suggest from recent chats"** button on `/dashboard/learning` (`POST /api/faqs/suggest`). The coach approves/edits/rejects on that page (existing `/api/faqs` PATCH → `status='active'`), after which the bot uses them.

## PLANNED (not yet implemented)

- @mention-only mode (bot only responds when @mentioned)
- Member/parent signup system (`members` table)
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
