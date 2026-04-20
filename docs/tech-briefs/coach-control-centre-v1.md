# MCA Coach Control Centre — Tech Brief v1.0

**Date:** 2026-04-20
**Status:** Draft for approval
**Owner:** Mario
**Supersedes:** Paul's external v1.0 Promotion Builder brief (not received — this consolidates both addendums)

---

## 1. Purpose

Build a dashboard-driven Coach Control Centre that lets authorised coaches, GMs, and admins trigger outbound communications and club operations on behalf of the club. Every action goes through the single MCA WhatsApp bot to specified programme groups.

Consolidates:
- Promotion Builder (main) — generate and send promotions
- Permission Model — who can do what
- Polls — lightweight group polls with response tracking
- Fixtures — match/event publishing
- Schedule model — recurring sessions with cancellation support
- Cancellation flow — internal-first, external-second notifications
- Refer-a-Friend — referral landing page + conversion sequence

---

## 2. Architectural decisions (locked in)

| Decision | Value | Rationale |
|---|---|---|
| Data layer | **Postgres (Neon)** for everything | Single source of truth. Airtable references in Paul's docs translate to Postgres tables. |
| Bot identity | **Single shared bot** (`paul-bot`, +447458164754) for all groups | Massive cost/ops saving (one WhatsApp number, one Evolution instance, one QR scan). Trust model preserved by the message content, not the sender number. |
| Auth | **Upgrade to JWT + HTTP-only cookies** (jose library already in package.json) | Required for proper permission checks. LocalStorage auth is not sufficient. |
| Coach schema | **`coaches_v2` + `providers`** (V2 tables already migrated) | The old `coaches` table is legacy-only during transition. New features use V2. |
| Programme schema | **`programmes`** (V2 table) | Already migrated. The old `programs` table will be phased out. |
| Per-group identity | **Rejected** | Confirmed: Mario wants one bot. Everything below works with that. |

### Does "one bot" block anything Paul asked for?

Short answer: no. Long answer: the only thing we lose is the cosmetic "messages come from your own group's bot number" — but since there's only ever been one bot, and Paul himself is the first coach, no parents have a different-number expectation. For coach #2 onwards, the bot is still a consistent entity. Everything functional (sending to specific groups, permissions, polls, fixtures, cancellations) works identically.

---

## 3. Permission model

### Roles

| Role | Source | Scope |
|---|---|---|
| `coach_owner` | `coaches_v2.is_owner = true` | All programmes where `programmes.coach_id = self` |
| `coach_assigned` | `programme_assignments` linking table | Only programmes assigned via the table |
| `club_gm` | `providers.gm_user_id` or new `provider_staff` table | All programmes in the provider |
| `club_admin` | `provider_staff.role = 'admin'` | All programmes in the provider |
| `parent` / default | No matching rows in any of the above | Zero Control Centre access |

### New tables needed

```sql
CREATE TABLE IF NOT EXISTS provider_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES coaches_v2(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('gm','admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (provider_id, coach_id)
);

CREATE TABLE IF NOT EXISTS programme_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id UUID NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES coaches_v2(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (programme_id, coach_id)
);
```

### Two-stage check

1. **Pre-send** — `GET /api/auth/authorised-programmes` returns only programmes the user can post to. Dashboard form populates from this list. Unauthorised programmes are invisible (not greyed out).
2. **Send-time** — every POST that creates a promotion/poll/fixture re-runs the check against submitted `programme_ids[]`. If any falls outside authority, HTTP 403.

### Shared helper

`app/lib/permissions.ts`:
```
getAuthorisedProgrammes(userId): Promise<Programme[]>
canUserPostTo(userId, programmeId): Promise<boolean>
requireAuthorityOver(userId, programmeIds): throws if any fail
```

---

## 4. Data model (Postgres)

New tables (idempotent migrations added to `/api/db-migrate`):

### 4.1 Promotions

```sql
CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES coaches_v2(id),
  promotion_type VARCHAR(30) NOT NULL CHECK (promotion_type IN ('social_event','refer_a_friend','holiday_camp','other')),
  title TEXT,
  detail TEXT NOT NULL,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  venue TEXT,
  cost_gbp NUMERIC(10,2),
  is_free BOOLEAN DEFAULT FALSE,
  payment_link TEXT,
  send_mode VARCHAR(20) NOT NULL CHECK (send_mode IN ('all_groups','selected_groups')),
  generated_message TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','cancelled','partial_failure')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS promotion_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  programme_id UUID NOT NULL REFERENCES programmes(id),
  send_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (send_status IN ('pending','sent','failed')),
  sent_at TIMESTAMPTZ,
  error TEXT,
  UNIQUE (promotion_id, programme_id)
);
```

### 4.2 Polls

```sql
CREATE TABLE IF NOT EXISTS polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES coaches_v2(id),
  question TEXT NOT NULL,
  options JSONB NOT NULL,             -- ["Yes","No","Maybe"]
  response_type VARCHAR(20) NOT NULL DEFAULT 'single' CHECK (response_type IN ('single','multiple')),
  closes_at TIMESTAMPTZ,
  anonymous BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS poll_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  programme_id UUID NOT NULL REFERENCES programmes(id),
  UNIQUE (poll_id, programme_id)
);

CREATE TABLE IF NOT EXISTS poll_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  programme_id UUID NOT NULL REFERENCES programmes(id),
  sender_jid TEXT NOT NULL,
  sender_name TEXT,
  chosen_option TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.3 Fixtures

```sql
CREATE TABLE IF NOT EXISTS fixtures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id UUID NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES coaches_v2(id),
  fixture_type VARCHAR(20) NOT NULL CHECK (fixture_type IN ('league','friendly','cup','tournament','other')),
  opposition TEXT,
  home_away VARCHAR(4) CHECK (home_away IN ('home','away')),
  kickoff_at TIMESTAMPTZ NOT NULL,
  meet_at TIMESTAMPTZ,
  venue TEXT,
  kit_notes TEXT,
  availability_poll_id UUID REFERENCES polls(id),
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled','played')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.4 Schedule (recurring series + exceptions)

```sql
CREATE TABLE IF NOT EXISTS schedule_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id UUID NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  series_type VARCHAR(20) NOT NULL CHECK (series_type IN ('training','fixture_recurring')),
  title TEXT,
  recurrence_rule TEXT NOT NULL,   -- RFC 5545 RRULE string, e.g. "FREQ=WEEKLY;BYDAY=SA"
  series_start DATE NOT NULL,
  series_end DATE,
  default_time TIME NOT NULL,
  default_duration_mins INTEGER DEFAULT 60,
  default_venue TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedule_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES schedule_series(id) ON DELETE CASCADE,
  original_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('cancelled','rescheduled')),
  rescheduled_to TIMESTAMPTZ,
  reason TEXT,
  cancelled_by UUID NOT NULL REFERENCES coaches_v2(id),
  cancelled_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (series_id, original_date)
);
```

### 4.5 Notifications log

```sql
CREATE TABLE IF NOT EXISTS notifications_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(40) NOT NULL,        -- 'promotion_sent', 'cancellation_internal', 'cancellation_external', 'poll_sent', 'fixture_published'
  trigger_user UUID REFERENCES coaches_v2(id),
  programme_id UUID REFERENCES programmes(id),
  recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('coach','gm','admin','group','parent')),
  recipient_jid TEXT,
  channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
  status VARCHAR(20) NOT NULL CHECK (status IN ('sent','failed')),
  error TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.6 Referrals (for Refer-a-Friend)

```sql
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  programme_id UUID NOT NULL REFERENCES programmes(id),
  friend_first_name TEXT NOT NULL,
  child_name TEXT,
  friend_email TEXT,
  friend_phone TEXT NOT NULL,
  referred_by_name TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'referral_pending' CHECK (status IN ('referral_pending','confirmed','attended','converted','lapsed')),
  first_session_at TIMESTAMPTZ,
  attended_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  last_nudged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. API surface

All routes are Next.js App Router `route.ts` handlers. Auth via new JWT cookie. All return JSON.

### 5.1 Auth & permissions
- `GET /api/auth/me` — current user + roles
- `GET /api/auth/authorised-programmes` — list of programme IDs the user can act on

### 5.2 Promotions
- `POST /api/promotions` — create draft + generate AI message
- `POST /api/promotions/[id]/regenerate` — regenerate the AI message
- `POST /api/promotions/[id]/send` — send to targets (enforces auth)
- `GET /api/promotions` — list (scoped to user's authorised programmes)
- `GET /api/promotions/[id]` — detail

### 5.3 Polls
- `POST /api/polls` — create + send
- `POST /api/polls/[id]/close` — close
- `POST /api/polls/[id]/extend` — extend deadline
- `POST /api/polls/[id]/remind` — nudge non-responders
- `GET /api/polls` — list
- `GET /api/polls/[id]/responses` — live tally

### 5.4 Fixtures
- `POST /api/fixtures` — create + send to group (optional availability poll)
- `POST /api/fixtures/[id]/cancel` — cancel a fixture (triggers notification cascade)
- `GET /api/fixtures` — list

### 5.5 Schedule
- `POST /api/schedule/series` — create recurring series
- `POST /api/schedule/exceptions` — cancel or reschedule one instance (triggers cascade)
- `GET /api/schedule/upcoming?programme_id=...&weeks=4` — materialise upcoming instances (reads series + exceptions)

### 5.6 Referrals (public)
- `GET /api/referrals/[promotionSlug]` — public landing page data (no auth)
- `POST /api/referrals/[promotionSlug]` — submit referral (no auth, rate-limited)

### 5.7 Webhook (extended)
- `POST /api/webhooks/whatsapp` — extended to handle:
  - Poll responses (matches `chosen_option` against `poll_targets` for sender's group)
  - Cancellation replies (future)
  - Existing @mention Q&A flow

### 5.8 Cron (Contabo)
- New: `POST /api/referrals/nudges` — processes referral reminder sequence (T+24h, T+session day, T+24h post, T+7d)

---

## 6. Dashboard pages

| Route | Purpose |
|---|---|
| `/dashboard/control-centre` | Hub with action buttons (Promotion, Poll, Fixture, Cancel Session) |
| `/dashboard/promotions/new` | Promotion Builder form |
| `/dashboard/promotions` | List + status |
| `/dashboard/promotions/[id]` | Detail + regenerate/preview/send |
| `/dashboard/polls/new` | Poll Builder form |
| `/dashboard/polls/[id]` | Live tally |
| `/dashboard/fixtures/new` | Fixture Publisher form |
| `/dashboard/schedule` | Calendar view with cancel/reschedule actions |
| `/dashboard/referrals` | Referral list, status, convert/nudge controls |
| `/refer/[slug]` | Public referral landing page (no auth) |

The Control Centre button is **hidden** for users with no authorised programmes.

---

## 7. AI message generation

Shared helper `app/lib/ai-messages.ts`:

```ts
async function generatePromotionMessage(input: {
  promotionType, title, detail, startAt, endAt, venue, costGbp, isFree, paymentLink, coachName, programmeName
}): Promise<string>
```

Uses Claude Haiku 4.5, ~200 tokens, system prompt tuned for:
- Warm coach voice (not corporate)
- WhatsApp-appropriate length (2–4 sentences + CTA)
- One emoji max
- Always includes CTA matching the promotion type

Parallel helpers for cancellation messages, fixture announcements, poll prompts.

---

## 8. Notification cascade (cancellations)

Critical: **internal first, external second, external blocked on internal failure**.

```
cancelSession(sessionInstance, reason, rescheduleTo?)
  → create schedule_exception
  → notifyInternal(programme.coach + gm_of_provider + other_assigned_coaches)
      → await all internal messages succeed
      → if any fail: notifications_log.status=failed, alert coach to retry, DO NOT send external
  → notifyExternal(group_jid)
      → log to notifications_log
```

Implementation is sequential `await` with explicit error branching. No fire-and-forget.

---

## 9. Build plan — phased

### Phase 1 — Foundations (prerequisite for everything)
1. **Permissions module** (`app/lib/permissions.ts`) + `provider_staff` + `programme_assignments` tables
2. **JWT auth cutover** — login/signup set httpOnly cookie, all protected routes use `getAuthFromRequest`
3. `/api/auth/me` + `/api/auth/authorised-programmes`
4. Dashboard shell with Control Centre hub (hidden for unauthorised users)

**Output:** every future feature can safely assume "authenticated + authorised user".

### Phase 2 — Promotions (simplest, delivers value)
5. `promotions` + `promotion_targets` tables
6. `app/lib/ai-messages.ts` — AI prompt template for promotion messages
7. `POST /api/promotions` (create + generate), `POST /api/promotions/[id]/send`
8. `/dashboard/promotions/new` with form + preview pane + regenerate button
9. `/dashboard/promotions` list + detail

**Output:** coach creates a promotion, previews, sends. First visible feature.

### Phase 3 — Polls
10. `polls` + `poll_targets` + `poll_responses` tables
11. Extend webhook to parse poll responses (match text against active poll options for that group)
12. `POST /api/polls`, close, extend, remind
13. `/dashboard/polls/new` + live tally view

### Phase 4 — Fixtures
14. `fixtures` table
15. `POST /api/fixtures` with optional availability-poll creation
16. `/dashboard/fixtures/new` + list

### Phase 5 — Schedule model + cancellations (biggest piece)
17. `schedule_series` + `schedule_exceptions` tables
18. RRULE helper (`rrule` npm package — ASK before adding) to materialise instances from a series
19. Backfill Paul's existing training as a series
20. `POST /api/schedule/series`, `POST /api/schedule/exceptions`
21. Calendar view with cancel/reschedule action
22. **Notification cascade** with internal-first guarantee (`app/lib/notify.ts`)
23. `notifications_log` table

### Phase 6 — Refer-a-Friend (new customer flow)
24. `referrals` table + public landing page at `/refer/[slug]`
25. AI message generator for referral promotions auto-includes unique landing URL
26. Post-submit confirmation message
27. Contabo cron: `mca-referral-nudges.sh` → `POST /api/referrals/nudges` runs hourly
28. `/dashboard/referrals` dashboard for coach to mark "attended", "converted"

### Phase 7 — Post-launch polish
29. Polls: anonymous mode
30. Fixtures: result-entry after play
31. Schedule: bulk-reschedule (rain-off day)
32. Notifications: batched digest for GMs ("4 things happened today")

### Out of scope for now
- Per-group bot identities (rejected)
- Member signup DM flow (separate epic)
- Payments (separate — Paul's docs reference "once Stripe is live")
- Public discovery directory
- Attendance / payment chasing

---

## 10. Risks & open questions

| # | Risk | Mitigation |
|---|---|---|
| 1 | Paul's main v1.0 brief may have details not in the addendums we've seen | Build from the addendums + this consolidated brief. If Paul later surfaces the v1.0, we reconcile. |
| 2 | WhatsApp Business API rules for outbound broadcasts. Per group membership we're usually fine — but promotions to 100+ contacts can trigger limits. | Start manual ("generate message, coach taps Send"). Only move to fully automated later with a registered template via Meta if needed. |
| 3 | RRULE library dependency | Ask before adding `rrule` (3kb, well-maintained, MIT). Alternative: hand-rolled weekly/daily only. |
| 4 | JWT auth cutover touches existing login/signup/dashboard — regression risk | Do it in its own branch, thorough smoke test before other phases start. |
| 5 | Notification cascade can get stuck if internal coach never acks | No ack required — just "sent successfully via API" counts as internal done. Retry surfaces on dashboard. |

---

## 11. Acceptance criteria

Consolidated from both addendums:

**Permissions (AC-P)**
- AC-P1: Control Centre hidden from users with no authority
- AC-P2: Pre-send filter only shows authorised programmes
- AC-P3: Send-time re-check blocks unauthorised programme_ids (HTTP 403)

**Promotions (AC-M)**
- AC-M1: Create Promotion button only for authorised users
- AC-M2: AI generates a WhatsApp-ready message from form fields
- AC-M3: Coach can regenerate message N times before sending
- AC-M4: Send delivers to each selected group via shared bot
- AC-M5: Partial failures recorded with `partial_failure` status
- AC-M6: Promotions table has `created_by`, `send_mode`, status enum

**Polls (AC-L)**
- AC-L1: Poll sent to selected groups; options configurable 2–6
- AC-L2: Bot recognises option text in group replies and logs votes
- AC-L3: Live tally visible on dashboard
- AC-L4: Close / extend / nudge non-responders all work
- AC-L5: Question/options locked after first send

**Fixtures (AC-F)**
- AC-F1: Fixtures always `Select Groups` (no All)
- AC-F2: Optional availability poll auto-created and linked
- AC-F3: Fixture cancellation triggers cascade

**Schedule (AC-S)**
- AC-S1: Recurring sessions stored as `schedule_series` with RRULE
- AC-S2: Cancelling one instance creates a `schedule_exception`, series unchanged
- AC-S3: Upcoming view reads series + exceptions correctly
- AC-S4: Reschedule produces external message with new datetime

**Notifications (AC-N)**
- AC-N1: Internal notifications fire and succeed before external
- AC-N2: External blocked if internal fails; coach alerted
- AC-N3: `notifications_log` has a row per event with status

**Referrals (AC-R)**
- AC-R1: Public landing page at `/refer/[slug]` accepts submission with name, phone, email, child name, referrer
- AC-R2: Submission creates `referrals` record with `referral_pending`
- AC-R3: Confirmation message sent automatically
- AC-R4: Nudge cron sends T+24h, T+session, T+24h post, T+7d messages
- AC-R5: Coach dashboard can mark attended/converted

---

## 12. First-session deliverable

If Mario approves this plan, the next session builds **Phase 1 only** (Foundations). That's:
- `provider_staff` + `programme_assignments` tables
- `app/lib/permissions.ts` with the three helpers
- JWT auth cutover on login/signup/dashboard
- `/api/auth/me` + `/api/auth/authorised-programmes`
- Dashboard Control Centre shell (empty buttons, hidden if no authority)

Nothing user-visible yet beyond the shell. Everything after depends on this.

---

*End of brief*
