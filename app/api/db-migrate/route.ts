// Migration route — idempotent, safe to run multiple times.
// Hit POST /api/db-migrate after deploying.
// Contains both V2 schema (providers/coaches_v2/programmes) and
// Week 1 operational tables (conversations, bot_replies, etc).
import { NextResponse } from 'next/server'
import { sql } from '@/app/lib/sql'

export async function POST() {
  try {
    // ── 1. Providers (account holders) ──
    await sql`
      CREATE TABLE IF NOT EXISTS providers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_type VARCHAR(50) NOT NULL DEFAULT 'solo_coach_instructor',
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        mobile_whatsapp VARCHAR(20) NOT NULL DEFAULT '',
        trading_name VARCHAR(200),
        town_city VARCHAR(100),
        postcode VARCHAR(10),
        referral_source VARCHAR(50),
        email_verified BOOLEAN DEFAULT false,
        registration_status VARCHAR(30) DEFAULT 'started',
        stripe_account_id VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `

    // ── 2. Coaches (separate from provider for club scaling) ──
    await sql`
      CREATE TABLE IF NOT EXISTS coaches_v2 (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL,
        mobile VARCHAR(20) NOT NULL DEFAULT '',
        sport VARCHAR(50),
        coaching_level VARCHAR(50),
        dbs_status VARCHAR(50),
        dbs_issue_date DATE,
        governing_body TEXT[],
        first_aid VARCHAR(50),
        public_liability VARCHAR(20),
        whatsapp_bot_status VARCHAR(30) DEFAULT 'not_yet_registered',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `

    // ── 3. Programmes (comprehensive) ──
    await sql`
      CREATE TABLE IF NOT EXISTS programmes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        coach_id UUID NOT NULL REFERENCES coaches_v2(id) ON DELETE CASCADE,
        programme_name VARCHAR(200) NOT NULL,
        short_description TEXT,
        target_audience VARCHAR(50),
        specific_age_group VARCHAR(30),
        skill_level VARCHAR(50),
        programme_type VARCHAR(50),
        session_days TEXT[],
        session_start_time VARCHAR(10),
        session_duration VARCHAR(20),
        session_frequency VARCHAR(30),
        holiday_schedule VARCHAR(100),
        cancellation_notice VARCHAR(20),
        venue_name VARCHAR(200),
        venue_address TEXT,
        parking VARCHAR(50),
        nearest_transport VARCHAR(200),
        indoor_outdoor VARCHAR(30),
        bad_weather_policy VARCHAR(100),
        max_capacity INTEGER,
        current_members INTEGER DEFAULT 0,
        full_threshold VARCHAR(30) DEFAULT 'at_100',
        waitlist_enabled BOOLEAN DEFAULT true,
        referral_trigger VARCHAR(50),
        referral_incentive TEXT,
        programme_status VARCHAR(50) DEFAULT 'open',
        trial_available VARCHAR(30),
        trial_instructions TEXT,
        what_to_bring TEXT,
        equipment_provided VARCHAR(30),
        kit_required VARCHAR(30),
        kit_details TEXT,
        paid_or_free VARCHAR(20) DEFAULT 'paid',
        payment_model VARCHAR(50),
        price_gbp NUMERIC(10,2),
        price_includes TEXT,
        sibling_discount TEXT,
        refund_policy VARCHAR(50),
        refund_details TEXT,
        payment_methods TEXT[],
        payment_reminder_schedule VARCHAR(30),
        bot_notes TEXT,
        whatsapp_group_id VARCHAR(50),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `

    // ── 4. FAQs (one row per Q&A pair) ──
    await sql`
      CREATE TABLE IF NOT EXISTS faqs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        programme_id UUID NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        category VARCHAR(50),
        source VARCHAR(30) DEFAULT 'coach',
        status VARCHAR(30) DEFAULT 'active',
        times_asked INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `

    // ── 5. Members ──
    await sql`
      CREATE TABLE IF NOT EXISTS members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        programme_id UUID NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
        parent_name VARCHAR(200),
        parent_email VARCHAR(255),
        parent_whatsapp_id VARCHAR(50),
        parent_phone VARCHAR(20),
        child_name VARCHAR(200),
        child_dob DATE,
        medical_flag BOOLEAN DEFAULT false,
        status VARCHAR(30) DEFAULT 'active',
        waitlist_position INTEGER,
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `

    // ── 6. Conversations (bot memory + comms audit trail) ──
    // Note: the V2 schema below coexists with the simpler Week 1 version.
    // Both use CREATE IF NOT EXISTS, so whichever runs first wins.
    // The V2 schema has more columns (coach_id, sender_type, channel, etc).
    await sql`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        programme_id UUID REFERENCES programmes(id),
        coach_id UUID REFERENCES coaches_v2(id),
        sender_name VARCHAR(200),
        sender_identifier VARCHAR(255),
        sender_type VARCHAR(30),
        channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
        message_text TEXT NOT NULL,
        category VARCHAR(50),
        bot_response TEXT,
        bot_mode VARCHAR(20),
        score VARCHAR(20),
        escalated BOOLEAN DEFAULT false,
        escalation_type VARCHAR(30),
        escalation_acked_at TIMESTAMP,
        member_id UUID REFERENCES members(id),
        group_jid TEXT,
        sender_jid TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `

    // ── 7. Payments ──
    await sql`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        programme_id UUID NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
        amount_gbp NUMERIC(10,2) NOT NULL,
        payment_type VARCHAR(30),
        payment_method VARCHAR(30),
        status VARCHAR(30) DEFAULT 'pending',
        due_date DATE,
        paid_at TIMESTAMPTZ,
        stripe_payment_id VARCHAR(100),
        reminders_sent INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `

    // ── 8. Attendance ──
    await sql`
      CREATE TABLE IF NOT EXISTS attendance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        programme_id UUID NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
        member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        session_date DATE NOT NULL,
        status VARCHAR(20),
        responded_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `

    // ── 9. Signup Sessions (WhatsApp signup conversation state) ──
    await sql`
      CREATE TABLE IF NOT EXISTS signup_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        programme_id UUID NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
        whatsapp_jid VARCHAR(50) NOT NULL,
        step VARCHAR(30) NOT NULL DEFAULT 'parent_name',
        data JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `

    // ── 10. Bot Replies (rate limiting + dedup) ──
    await sql`
      CREATE TABLE IF NOT EXISTS bot_replies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_jid VARCHAR(50) NOT NULL,
        reply_type VARCHAR(30) NOT NULL,
        message_id TEXT,
        sent_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS idx_bot_replies_lookup ON bot_replies (group_jid, reply_type, sent_at)`

    // ── Backfill columns that may be missing if V2 tables were created before Week 1 merge ──
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS group_jid TEXT`
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sender_jid TEXT`
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS escalation_acked_at TIMESTAMP`
    await sql`ALTER TABLE bot_replies ADD COLUMN IF NOT EXISTS message_id TEXT`

    // ── Week 1 operational tables ──

    // Alert dedup log
    await sql`
      CREATE TABLE IF NOT EXISTS alert_log (
        id SERIAL PRIMARY KEY,
        alert_key TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        sent_at TIMESTAMP DEFAULT NOW()
      )
    `
    await sql`
      CREATE INDEX IF NOT EXISTS idx_alert_log_key_sent
      ON alert_log(alert_key, sent_at DESC)
    `

    // Message dedup
    await sql`
      CREATE TABLE IF NOT EXISTS processed_messages (
        message_id TEXT PRIMARY KEY,
        processed_at TIMESTAMP DEFAULT NOW()
      )
    `
    await sql`
      CREATE INDEX IF NOT EXISTS idx_processed_messages_age
      ON processed_messages(processed_at)
    `

    // Health check state tracking
    await sql`
      CREATE TABLE IF NOT EXISTS health_state (
        check_name TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        consecutive_failures INTEGER DEFAULT 0,
        last_checked_at TIMESTAMP DEFAULT NOW()
      )
    `

    // Invite codes
    await sql`
      CREATE TABLE IF NOT EXISTS invite_codes (
        code TEXT PRIMARY KEY,
        created_by TEXT NOT NULL,
        max_uses INTEGER DEFAULT 1,
        uses INTEGER DEFAULT 0,
        expires_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `

    // Tester flags on coaches (legacy table). Only applied if the table
    // actually exists — fresh Contabo deploys have no legacy `coaches`
    // table, and ALTER TABLE on a missing table errors regardless of the
    // IF NOT EXISTS on the column.
    const { rows: legacyCoachesCheck } = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'coaches'
      ) AS exists
    `
    if (legacyCoachesCheck[0]?.exists) {
      await sql`ALTER TABLE coaches ADD COLUMN IF NOT EXISTS invite_code TEXT`
      await sql`ALTER TABLE coaches ADD COLUMN IF NOT EXISTS is_tester BOOLEAN DEFAULT FALSE`
    }

    // ═══════════════════════════════════════════════════════════
    // Coach Control Centre — Phase 1: Permissions
    // ═══════════════════════════════════════════════════════════

    // provider_staff: who (coaches_v2 row) has GM/admin role in a provider
    await sql`
      CREATE TABLE IF NOT EXISTS provider_staff (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        coach_id UUID REFERENCES coaches_v2(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL CHECK (role IN ('gm','admin')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (provider_id, coach_id)
      )
    `

    // programme_assignments: a coach can be assigned to programmes they don't own
    await sql`
      CREATE TABLE IF NOT EXISTS programme_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        programme_id UUID NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
        coach_id UUID NOT NULL REFERENCES coaches_v2(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (programme_id, coach_id)
      )
    `

    // ═══════════════════════════════════════════════════════════
    // Coach Control Centre — Phase 2: Promotions
    // ═══════════════════════════════════════════════════════════

    await sql`
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
        slug TEXT UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        sent_at TIMESTAMPTZ
      )
    `
    await sql`
      CREATE TABLE IF NOT EXISTS promotion_targets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
        programme_id UUID NOT NULL REFERENCES programmes(id),
        send_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (send_status IN ('pending','sent','failed')),
        sent_at TIMESTAMPTZ,
        error TEXT,
        UNIQUE (promotion_id, programme_id)
      )
    `

    // ═══════════════════════════════════════════════════════════
    // Coach Control Centre — Phase 3: Polls
    // ═══════════════════════════════════════════════════════════

    await sql`
      CREATE TABLE IF NOT EXISTS polls (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_by UUID NOT NULL REFERENCES coaches_v2(id),
        question TEXT NOT NULL,
        options JSONB NOT NULL,
        response_type VARCHAR(20) NOT NULL DEFAULT 'single' CHECK (response_type IN ('single','multiple')),
        closes_at TIMESTAMPTZ,
        anonymous BOOLEAN DEFAULT FALSE,
        status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        closed_at TIMESTAMPTZ
      )
    `
    await sql`
      CREATE TABLE IF NOT EXISTS poll_targets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
        programme_id UUID NOT NULL REFERENCES programmes(id),
        UNIQUE (poll_id, programme_id)
      )
    `
    await sql`
      CREATE TABLE IF NOT EXISTS poll_responses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
        programme_id UUID NOT NULL REFERENCES programmes(id),
        sender_jid TEXT NOT NULL,
        sender_name TEXT,
        chosen_option TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
    // Per-group WhatsApp message ID returned from sendPoll, used to match
    // incoming pollUpdateMessage webhook events back to our poll.
    await sql`ALTER TABLE poll_targets ADD COLUMN IF NOT EXISTS wa_message_id TEXT`
    await sql`CREATE INDEX IF NOT EXISTS idx_poll_targets_wa_msgid ON poll_targets(wa_message_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_poll_responses_poll ON poll_responses(poll_id)`

    // ═══════════════════════════════════════════════════════════
    // Coach Control Centre — Phase 4: Fixtures
    // ═══════════════════════════════════════════════════════════

    await sql`
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
      )
    `

    // ═══════════════════════════════════════════════════════════
    // Coach Control Centre — Phase 5: Schedule + cancellations
    // ═══════════════════════════════════════════════════════════

    await sql`
      CREATE TABLE IF NOT EXISTS schedule_series (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        programme_id UUID NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
        series_type VARCHAR(20) NOT NULL CHECK (series_type IN ('training','fixture_recurring')),
        title TEXT,
        recurrence_rule TEXT NOT NULL,
        series_start DATE NOT NULL,
        series_end DATE,
        default_time TIME NOT NULL,
        default_duration_mins INTEGER DEFAULT 60,
        default_venue TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await sql`
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
      )
    `

    // Notifications log (used by cancellation cascade + everything else)
    await sql`
      CREATE TABLE IF NOT EXISTS notifications_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type VARCHAR(40) NOT NULL,
        trigger_user UUID REFERENCES coaches_v2(id),
        programme_id UUID REFERENCES programmes(id),
        recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('coach','gm','admin','group','parent')),
        recipient_jid TEXT,
        channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
        status VARCHAR(20) NOT NULL CHECK (status IN ('sent','failed')),
        error TEXT,
        sent_at TIMESTAMPTZ DEFAULT NOW()
      )
    `

    // ═══════════════════════════════════════════════════════════
    // Coach Control Centre — Phase 6: Refer-a-Friend
    // ═══════════════════════════════════════════════════════════

    await sql`
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
      )
    `
    // Track which nudge was last sent (pre_session | session_day | post_session | lapsed_check | null)
    await sql`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS last_nudge_step TEXT`

    // Resolved referrer attribution. The referee picks a parent from the
    // programme's member roster on the landing page; we store the FK +
    // flip referrer_resolved=true. referred_by_name remains as a fallback
    // for legacy rows + "Other / not on list" submissions, but new rows
    // should resolve through referrer_member_id when possible.
    await sql`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_member_id UUID REFERENCES members(id) ON DELETE SET NULL`
    await sql`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_resolved BOOLEAN NOT NULL DEFAULT FALSE`
    await sql`CREATE INDEX IF NOT EXISTS idx_referrals_referrer_member ON referrals(referrer_member_id) WHERE referrer_member_id IS NOT NULL`

    // Reward status state machine on the referral row itself.
    // referrer_reward_status: pending → notified (when referee attends)
    //                                → honoured (when coach issues the +1 credit)
    // referee_reward_status: pending → applied (when first session marked free)
    //                                → expired
    await sql`
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_reward_status VARCHAR(20)
        NOT NULL DEFAULT 'pending'
        CHECK (referrer_reward_status IN ('pending','notified','honoured'))
    `
    await sql`
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referee_reward_status VARCHAR(20)
        NOT NULL DEFAULT 'pending'
        CHECK (referee_reward_status IN ('pending','applied','expired'))
    `

    // Credit balance + lifetime usage on members.parent_name (the "Contacts"
    // table per Paul's spec §3.3). Coach honours credits manually at MVP.
    await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS referral_credits_balance INTEGER NOT NULL DEFAULT 0`
    await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS referral_credits_used INTEGER NOT NULL DEFAULT 0`

    // Audit trail for every credit movement. Append-only; never updated.
    await sql`
      CREATE TABLE IF NOT EXISTS referral_credit_ledger (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        referral_id UUID REFERENCES referrals(id) ON DELETE SET NULL,
        delta INTEGER NOT NULL,
        reason VARCHAR(50) NOT NULL,
        issued_by UUID REFERENCES coaches_v2(id),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS idx_referral_credit_ledger_member ON referral_credit_ledger(member_id, created_at DESC)`

    // ═══════════════════════════════════════════════════════════
    // Phase 7: Programme builder upgrades (prospect demo feedback)
    // ═══════════════════════════════════════════════════════════

    // Item 1 — Seasonal start/end. season_type values:
    //   'autumn_winter' | 'spring_summer' | 'full_year' | 'custom'
    // For 'custom', dates come from season_start_date / season_end_date.
    // For the first three, the form maps to canonical dates client-side
    // (Sept-Mar, Apr-Aug, Jan-Dec). We persist both the label and the
    // dates so reads don't need to recompute.
    await sql`ALTER TABLE programmes ADD COLUMN IF NOT EXISTS season_type VARCHAR(30)`
    await sql`ALTER TABLE programmes ADD COLUMN IF NOT EXISTS season_start_date DATE`
    await sql`ALTER TABLE programmes ADD COLUMN IF NOT EXISTS season_end_date DATE`

    // Item 5 — Skill level multi-select. skill_levels is the new canonical
    // column; the legacy skill_level scalar is kept and populated with the
    // first selected value for backward compatibility.
    await sql`ALTER TABLE programmes ADD COLUMN IF NOT EXISTS skill_levels TEXT[]`

    // Item 2 — Per-day session times. JSONB array of
    //   [{ day: 'Monday', startTime: '17:30', durationMins: 60 }, ...]
    // The legacy session_start_time / session_duration columns remain and
    // are populated from the first row for backward compatibility.
    await sql`ALTER TABLE programmes ADD COLUMN IF NOT EXISTS session_schedule JSONB`

    // ═══════════════════════════════════════════════════════════
    // Phase 8: Fitness studio vertical (Paul's brief)
    // All additive. Existing 'sport' coaches are not affected.
    // ═══════════════════════════════════════════════════════════

    // Per-coach vertical flag. 'sport' (current behaviour) | 'fitness'.
    // Drives label translation (Programme→Class, Coach→Trainer, Member→
    // Client) and gates fitness-only UI panels.
    await sql`
      ALTER TABLE coaches_v2 ADD COLUMN IF NOT EXISTS vertical VARCHAR(20)
        NOT NULL DEFAULT 'sport'
        CHECK (vertical IN ('sport','fitness'))
    `

    // session_feedback: completed feedback responses, one row per session
    // rating. score 1-5, optional written_feedback for low scores.
    // flagged_for_manager auto-set true when score <= 2 so the manager
    // dashboard can highlight problems.
    await sql`
      CREATE TABLE IF NOT EXISTS session_feedback (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        programme_id UUID NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
        client_jid TEXT NOT NULL,
        client_name TEXT,
        pt_coach_id UUID REFERENCES coaches_v2(id),
        pt_name TEXT,
        score INTEGER CHECK (score >= 1 AND score <= 5),
        written_feedback TEXT,
        flagged_for_manager BOOLEAN DEFAULT FALSE,
        session_date DATE,
        requested_at TIMESTAMPTZ DEFAULT NOW(),
        responded_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS idx_session_feedback_programme ON session_feedback(programme_id, created_at DESC)`
    await sql`CREATE INDEX IF NOT EXISTS idx_session_feedback_flagged ON session_feedback(flagged_for_manager, created_at DESC) WHERE flagged_for_manager = true`

    // pending_feedback: in-flight feedback requests waiting for a reply
    // from the client. Keyed by client_jid so the webhook can match
    // incoming 1:1 messages back to the right open request. State machine:
    //   awaiting_score → awaiting_comment_low (score 1-2)
    //                  → awaiting_referral_yes_no (score 4-5)
    //                  → completed
    // expires_at lets us auto-skip stale requests (default 48h window).
    await sql`
      CREATE TABLE IF NOT EXISTS pending_feedback (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        programme_id UUID NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
        client_jid TEXT NOT NULL,
        client_name TEXT,
        pt_coach_id UUID REFERENCES coaches_v2(id),
        pt_name TEXT,
        session_date DATE,
        prompt_message_id TEXT,
        state VARCHAR(30) NOT NULL DEFAULT 'awaiting_score'
          CHECK (state IN ('awaiting_score','awaiting_comment_low','awaiting_referral_yes_no','completed','expired')),
        refer_a_friend_slug TEXT,
        feedback_id UUID REFERENCES session_feedback(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours')
      )
    `
    // Partial index on open states only — webhook lookup is O(1) and the
    // 'completed'/'expired' rows (which can grow indefinitely) don't pollute
    // the index.
    await sql`
      CREATE INDEX IF NOT EXISTS idx_pending_feedback_open
        ON pending_feedback(client_jid)
        WHERE state IN ('awaiting_score','awaiting_comment_low','awaiting_referral_yes_no')
    `

    // Strip stray leading/trailing asterisks + whitespace from whatsapp_group_id.
    // Coaches sometimes copy the bot's "paste this group ID: *<jid>*" message
    // verbatim, leaving asterisks in the dashboard field that break the
    // exact-match lookup in findProgrammeByWhatsAppGroup. Idempotent: only
    // touches rows that need it; clamps to NULL when nothing remains.
    await sql`
      UPDATE programmes
      SET whatsapp_group_id = NULLIF(REGEXP_REPLACE(whatsapp_group_id, '(^[*[:space:]]+|[*[:space:]]+$)', '', 'g'), '')
      WHERE whatsapp_group_id IS NOT NULL
        AND whatsapp_group_id ~ '(^[*[:space:]]|[*[:space:]]$)'
    `

    // ═══════════════════════════════════════════════════════════
    // Holiday camp bookings — WhatsApp-native flow
    // ═══════════════════════════════════════════════════════════
    // Extends the existing holiday_camp promotion_type with a per-child
    // booking state machine. Parent receives a 1:1 invite per child, replies
    // with day selection, gets a confirmation + payment instructions, then
    // self-reports "PAID" once they've sent money externally (Monzo/bank).
    // Coach reconciles in the dashboard.

    // camp_days lives as JSONB on the promotion itself — array of
    // {date, label, price_gbp, capacity}. Keeps the schema flat for v1.
    await sql`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS camp_days JSONB`

    // One row per child-per-camp. Holds both the conversation state and the
    // final booking record. parent_jid is the WhatsApp identity that drives
    // 1:1 message matching.
    await sql`
      CREATE TABLE IF NOT EXISTS camp_bookings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
        member_id UUID REFERENCES members(id) ON DELETE SET NULL,
        parent_jid TEXT NOT NULL,
        parent_name TEXT,
        child_name TEXT,
        days_selected JSONB,
        total_gbp NUMERIC(10,2),
        state VARCHAR(40) NOT NULL DEFAULT 'awaiting_day_selection'
          CHECK (state IN (
            'awaiting_day_selection',
            'awaiting_payment_confirmation',
            'paid_self_reported',
            'confirmed',
            'cancelled',
            'expired'
          )),
        prompt_message_id TEXT,
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
        payment_self_reported_at TIMESTAMPTZ,
        payment_confirmed_at TIMESTAMPTZ,
        confirmed_by UUID REFERENCES coaches_v2(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
    // Partial index on open conversation states — webhook lookup is O(1)
    // and confirmed/cancelled/expired rows stay out of the hot path.
    await sql`
      CREATE INDEX IF NOT EXISTS idx_camp_bookings_open
        ON camp_bookings(parent_jid)
        WHERE state IN ('awaiting_day_selection','awaiting_payment_confirmation')
    `
    await sql`
      CREATE INDEX IF NOT EXISTS idx_camp_bookings_promotion
        ON camp_bookings(promotion_id, created_at DESC)
    `

    // ═══════════════════════════════════════════════════════════
    // Native bookable calendar (Paul's spec Flow 2 + Flow 12)
    // ═══════════════════════════════════════════════════════════
    // Five tables, all additive + idempotent:
    //   pt_availability        — weekly PT availability declarations
    //   calendar_slots         — derived bookable time slots
    //   pt_sessions            — booked private sessions
    //   pt_booking_state       — in-flight WhatsApp booking conversation state
    //   pt_availability_prompts — weekly prompt tracker for Flow 12 follow-up PR

    await sql`
      CREATE TABLE IF NOT EXISTS pt_availability (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        coach_id UUID NOT NULL REFERENCES coaches_v2(id) ON DELETE CASCADE,
        week_commencing DATE NOT NULL,
        day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        start_time TIME NOT NULL,
        end_time TIME NOT NULL CHECK (end_time > start_time),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS idx_pt_availability_coach_week ON pt_availability(coach_id, week_commencing)`

    await sql`
      CREATE TABLE IF NOT EXISTS calendar_slots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        coach_id UUID NOT NULL REFERENCES coaches_v2(id) ON DELETE CASCADE,
        slot_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        duration_min INTEGER NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'available'
          CHECK (status IN ('available','held','booked','cancelled')),
        held_by_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
        hold_expiry TIMESTAMPTZ,
        booked_by_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
        pt_session_id UUID,
        price_gbp NUMERIC(10,2),
        recurring BOOLEAN DEFAULT FALSE,
        series_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_slots_dedup ON calendar_slots(coach_id, slot_date, start_time)`
    await sql`CREATE INDEX IF NOT EXISTS idx_calendar_slots_available ON calendar_slots(coach_id, slot_date, start_time) WHERE status = 'available'`
    await sql`CREATE INDEX IF NOT EXISTS idx_calendar_slots_held_expiry ON calendar_slots(hold_expiry) WHERE status = 'held'`

    await sql`
      CREATE TABLE IF NOT EXISTS pt_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        coach_id UUID NOT NULL REFERENCES coaches_v2(id),
        member_id UUID NOT NULL REFERENCES members(id),
        slot_id UUID REFERENCES calendar_slots(id) ON DELETE SET NULL,
        session_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        duration_min INTEGER NOT NULL,
        price_gbp NUMERIC(10,2),
        status VARCHAR(30) NOT NULL DEFAULT 'booked'
          CHECK (status IN ('booked','completed','cancelled','no_show')),
        payment_status VARCHAR(20) DEFAULT 'pending'
          CHECK (payment_status IN ('pending','self_reported','confirmed','refunded')),
        payment_link_used TEXT,
        payment_self_reported_at TIMESTAMPTZ,
        payment_confirmed_at TIMESTAMPTZ,
        feedback_score INTEGER CHECK (feedback_score BETWEEN 1 AND 5),
        notes TEXT,
        cancelled_at TIMESTAMPTZ,
        cancelled_by_member BOOLEAN,
        cancellation_fee_gbp NUMERIC(10,2),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS idx_pt_sessions_coach_date ON pt_sessions(coach_id, session_date DESC)`
    await sql`CREATE INDEX IF NOT EXISTS idx_pt_sessions_member ON pt_sessions(member_id, session_date DESC)`
    await sql`CREATE INDEX IF NOT EXISTS idx_pt_sessions_payment ON pt_sessions(payment_status, session_date) WHERE payment_status IN ('pending','self_reported')`

    // Now that pt_sessions exists, retro-add the FK from calendar_slots
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'calendar_slots_pt_session_id_fkey'
        ) THEN
          ALTER TABLE calendar_slots
            ADD CONSTRAINT calendar_slots_pt_session_id_fkey
            FOREIGN KEY (pt_session_id) REFERENCES pt_sessions(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `

    // In-flight conversation state — mirrors the pending_feedback / camp_bookings
    // self-gating pattern. Webhook lookup is O(1) via the partial index.
    await sql`
      CREATE TABLE IF NOT EXISTS pt_booking_state (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        member_jid TEXT NOT NULL,
        member_id UUID REFERENCES members(id) ON DELETE CASCADE,
        state VARCHAR(40) NOT NULL DEFAULT 'awaiting_pt_choice'
          CHECK (state IN (
            'awaiting_pt_choice',
            'awaiting_slot_choice',
            'awaiting_payment_confirmation',
            'completed',
            'cancelled',
            'expired'
          )),
        coach_id UUID REFERENCES coaches_v2(id),
        pt_options JSONB,
        slot_options JSONB,
        chosen_slot_id UUID REFERENCES calendar_slots(id) ON DELETE SET NULL,
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await sql`
      CREATE INDEX IF NOT EXISTS idx_pt_booking_state_open ON pt_booking_state(member_jid)
        WHERE state IN ('awaiting_pt_choice','awaiting_slot_choice','awaiting_payment_confirmation')
    `

    // Weekly PT availability prompt tracker — used by Flow 12 (separate PR)
    await sql`
      CREATE TABLE IF NOT EXISTS pt_availability_prompts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        coach_id UUID NOT NULL REFERENCES coaches_v2(id) ON DELETE CASCADE,
        week_commencing DATE NOT NULL,
        state VARCHAR(20) NOT NULL DEFAULT 'awaiting_reply'
          CHECK (state IN ('awaiting_reply','received','reminded','escalated')),
        prompted_at TIMESTAMPTZ DEFAULT NOW(),
        responded_at TIMESTAMPTZ,
        raw_response TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(coach_id, week_commencing)
      )
    `

    // ═══════════════════════════════════════════════════════════
    // Inbox Agent — every inbound message logged + classified
    // ═══════════════════════════════════════════════════════════
    // The Inbox Agent (Paul's spec) is the orchestration layer above all
    // flows. inbox_log gives us observability: every inbound message gets
    // an entry with sender identity, intent classification, and what the
    // bot did with it. Powers the Inbox dashboard panel + sentiment metrics.
    await sql`
      CREATE TABLE IF NOT EXISTS inbox_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        received_at TIMESTAMPTZ DEFAULT NOW(),
        sender_jid TEXT NOT NULL,
        sender_type VARCHAR(30),  -- 'member' | 'coach' | 'unknown'
        sender_record_id UUID,    -- member_id or coach_id (loose FK; nullable)
        coach_id UUID REFERENCES coaches_v2(id) ON DELETE SET NULL,
        programme_id UUID REFERENCES programmes(id) ON DELETE SET NULL,
        message_text TEXT,
        is_group BOOLEAN DEFAULT FALSE,
        group_jid TEXT,
        intent VARCHAR(40),       -- booking_request | class_enquiry | cancellation | payment_query | rescheduling | feedback_complaint | referral_interest | faq_general | membership_query | pt_availability | unclassifiable
        intent_confidence REAL,   -- 0..1 from the classifier
        sentiment VARCHAR(20),    -- positive | neutral | negative
        action_taken VARCHAR(60), -- e.g. 'routed_to_pt_booking' / 'bot_replied' / 'escalated_to_manager'
        resolved_by VARCHAR(20),  -- 'bot' | 'manager' | 'unresolved'
        escalated BOOLEAN DEFAULT FALSE,
        response_time_ms INTEGER,
        message_id TEXT           -- evolution message id for dedup tracing
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS idx_inbox_log_received ON inbox_log(received_at DESC)`
    await sql`CREATE INDEX IF NOT EXISTS idx_inbox_log_sender ON inbox_log(sender_jid, received_at DESC)`
    await sql`CREATE INDEX IF NOT EXISTS idx_inbox_log_coach ON inbox_log(coach_id, received_at DESC) WHERE coach_id IS NOT NULL`
    await sql`CREATE INDEX IF NOT EXISTS idx_inbox_log_escalated ON inbox_log(received_at DESC) WHERE escalated = true`

    // ═══════════════════════════════════════════════════════════
    // Phase 3 flow polish — cancellation, waitlist, memberships,
    // lapsed re-engagement, post-trial trigger
    // ═══════════════════════════════════════════════════════════

    // Cancellation policy on coaches_v2 (per-coach defaults).
    await sql`ALTER TABLE coaches_v2 ADD COLUMN IF NOT EXISTS cancellation_policy_hours INTEGER DEFAULT 24`
    await sql`ALTER TABLE coaches_v2 ADD COLUMN IF NOT EXISTS late_cancel_fee_pct INTEGER DEFAULT 50 CHECK (late_cancel_fee_pct BETWEEN 0 AND 100)`

    // is_trial on pt_sessions — drives Flow 9 (post-trial conversion).
    // Set true when a session is the member's first taster session.
    await sql`ALTER TABLE pt_sessions ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT FALSE`
    await sql`CREATE INDEX IF NOT EXISTS idx_pt_sessions_trial ON pt_sessions(is_trial, session_date DESC) WHERE is_trial = true`

    // ── Flow 6 cancellation state (1:1 conversation state machine) ──
    await sql`
      CREATE TABLE IF NOT EXISTS cancellation_state (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        member_jid TEXT NOT NULL,
        member_id UUID REFERENCES members(id) ON DELETE CASCADE,
        state VARCHAR(40) NOT NULL DEFAULT 'awaiting_session_choice'
          CHECK (state IN ('awaiting_session_choice','awaiting_confirm','completed','cancelled','expired')),
        session_options JSONB,  -- array of pt_session_id offered
        chosen_session_id UUID REFERENCES pt_sessions(id) ON DELETE SET NULL,
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await sql`
      CREATE INDEX IF NOT EXISTS idx_cancellation_state_open ON cancellation_state(member_jid)
        WHERE state IN ('awaiting_session_choice','awaiting_confirm')
    `

    // ── Flow 10 waitlist ──
    // Generic: applies to PT slots today; can extend to class sessions later.
    // When a calendar_slot frees, the cron picks the oldest open waitlist
    // entry whose target matches and notifies them.
    await sql`
      CREATE TABLE IF NOT EXISTS waitlist (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        coach_id UUID NOT NULL REFERENCES coaches_v2(id) ON DELETE CASCADE,
        member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        member_jid TEXT NOT NULL,
        target_type VARCHAR(20) NOT NULL DEFAULT 'pt_slot'
          CHECK (target_type IN ('pt_slot','class_session')),
        target_label TEXT,
        preferred_day_of_week SMALLINT CHECK (preferred_day_of_week BETWEEN 0 AND 6),
        preferred_time_window TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'waiting'
          CHECK (status IN ('waiting','notified','converted','expired','cancelled')),
        notified_slot_id UUID REFERENCES calendar_slots(id) ON DELETE SET NULL,
        notified_at TIMESTAMPTZ,
        hold_expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS idx_waitlist_waiting ON waitlist(coach_id, created_at ASC) WHERE status = 'waiting'`
    await sql`CREATE INDEX IF NOT EXISTS idx_waitlist_notified ON waitlist(hold_expires_at) WHERE status = 'notified'`

    // ── Flow 11 memberships ──
    await sql`
      CREATE TABLE IF NOT EXISTS memberships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        coach_id UUID REFERENCES coaches_v2(id) ON DELETE SET NULL,
        plan_name VARCHAR(100),
        price_gbp NUMERIC(10,2),
        billing_period VARCHAR(20) DEFAULT 'monthly'
          CHECK (billing_period IN ('monthly','quarterly','annual','one_off')),
        started_at DATE NOT NULL,
        expires_at DATE NOT NULL,
        auto_renew BOOLEAN DEFAULT FALSE,
        status VARCHAR(20) NOT NULL DEFAULT 'active'
          CHECK (status IN ('active','grace_period','lapsed','cancelled','renewed')),
        last_renewal_step VARCHAR(20),
        last_renewal_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS idx_memberships_expiry ON memberships(expires_at) WHERE status IN ('active','grace_period')`
    await sql`CREATE INDEX IF NOT EXISTS idx_memberships_member ON memberships(member_id, status)`

    // ── Flow 8 lapsed re-engagement log ──
    await sql`
      CREATE TABLE IF NOT EXISTS lapsed_reengagement_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        coach_id UUID REFERENCES coaches_v2(id) ON DELETE SET NULL,
        last_step VARCHAR(20),  -- day_14 | day_21 | day_30 | day_45 | day_90 | opted_out
        last_step_at TIMESTAMPTZ,
        last_session_at DATE,
        status VARCHAR(20) NOT NULL DEFAULT 'in_progress'
          CHECK (status IN ('in_progress','reactivated','opted_out','complete')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (member_id)
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS idx_lapsed_in_progress ON lapsed_reengagement_log(updated_at DESC) WHERE status = 'in_progress'`

    // ═══════════════════════════════════════════════════════════
    // Flow 4 — New Enquiry Chase Sequence
    // ═══════════════════════════════════════════════════════════
    // Unknown contact messages the bot → we create a prospects row + start
    // the 6-step chase ladder. They become a members row when they convert
    // (Flow 9 takes over via converted_to_member_id).
    await sql`
      CREATE TABLE IF NOT EXISTS prospects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        jid TEXT UNIQUE NOT NULL,
        phone TEXT,
        name TEXT,
        intent_text TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'enquiry_new'
          CHECK (status IN ('enquiry_new','replied','trial_booked','converted','opted_out','lapsed')),
        chase_step INTEGER NOT NULL DEFAULT 0,
        last_step_at TIMESTAMPTZ DEFAULT NOW(),
        source VARCHAR(30) DEFAULT 'whatsapp',
        converted_to_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS idx_prospects_chase ON prospects(last_step_at DESC) WHERE status = 'enquiry_new'`
    await sql`CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status, created_at DESC)`

    // ═══════════════════════════════════════════════════════════
    // Phase 5 — Flow 9 post-trial conversion + Flow 7 payment chase
    // ═══════════════════════════════════════════════════════════

    // Flow 9 state: tracks the conversion follow-up ladder after a trial
    // session completes. One row per trial pt_session.
    await sql`
      CREATE TABLE IF NOT EXISTS post_trial_state (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pt_session_id UUID NOT NULL REFERENCES pt_sessions(id) ON DELETE CASCADE,
        member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        last_step VARCHAR(20),  -- thanks_feedback | offer | followup_48h | final_7d | lapsed
        last_step_at TIMESTAMPTZ,
        feedback_score INTEGER,
        offer_sent BOOLEAN DEFAULT FALSE,
        converted_at TIMESTAMPTZ,
        status VARCHAR(20) NOT NULL DEFAULT 'in_progress'
          CHECK (status IN ('in_progress','converted','dropped','manager_review')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (pt_session_id)
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS idx_post_trial_in_progress ON post_trial_state(updated_at DESC) WHERE status = 'in_progress'`

    // Flow 7 payment chase log — tracks chase steps per pt_session or membership
    // (NOT a state machine; we recompute steps each cron run from timestamps).
    // We just log what we've fired so we don't double-send.
    await sql`
      CREATE TABLE IF NOT EXISTS payment_chase_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('pt_session','membership')),
        target_id UUID NOT NULL,
        member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        last_step VARCHAR(20),  -- failed_notice | reminder_24h | reminder_48h | escalation | suspension
        last_step_at TIMESTAMPTZ,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (target_type, target_id)
      )
    `

    // ── Migrate existing data from old tables ──
    const oldCoachesExist = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'coaches'
      )
    `

    let migrated = 0
    if (oldCoachesExist.rows[0].exists) {
      const existingCoaches = await sql`SELECT * FROM coaches`
      for (const coach of existingCoaches.rows) {
        const exists = await sql`SELECT id FROM providers WHERE email = ${coach.email}`
        if (exists.rows.length > 0) continue

        const nameParts = (coach.name || 'Coach').split(' ')
        const firstName = nameParts[0]
        const lastName = nameParts.slice(1).join(' ') || ''

        const provider = await sql`
          INSERT INTO providers (first_name, last_name, email, password_hash, email_verified, registration_status)
          VALUES (${firstName}, ${lastName}, ${coach.email}, ${coach.password_hash}, true, 'complete')
          RETURNING id
        `
        const newCoach = await sql`
          INSERT INTO coaches_v2 (provider_id, first_name, last_name, email, whatsapp_bot_status)
          VALUES (${provider.rows[0].id}, ${firstName}, ${lastName}, ${coach.email}, 'live')
          RETURNING id
        `

        const oldPrograms = await sql`SELECT * FROM programs WHERE coach_id = ${coach.id}`
        for (const prog of oldPrograms.rows) {
          const kb = prog.knowledgebase || {}
          const programme = await sql`
            INSERT INTO programmes (
              coach_id, programme_name, short_description,
              skill_level, venue_name, venue_address,
              what_to_bring, cancellation_notice,
              price_gbp, whatsapp_group_id, is_active,
              target_audience, bot_notes
            )
            VALUES (
              ${newCoach.rows[0].id}, ${prog.program_name}, ${kb.coachBio || null},
              ${kb.skillLevel || null}, ${kb.venue || null}, ${kb.venueAddress || null},
              ${kb.whatToBring || null}, ${kb.cancellationPolicy || null},
              ${kb.priceCents ? (kb.priceCents / 100) : null},
              ${prog.whatsapp_group_id || null}, ${prog.is_active ?? true},
              ${kb.ageGroup || null}, ${kb.medicalInfo || null}
            )
            RETURNING id
          `

          if (kb.customFaqs && Array.isArray(kb.customFaqs)) {
            for (const faq of kb.customFaqs) {
              if (faq.q && faq.a) {
                await sql`
                  INSERT INTO faqs (programme_id, question, answer, category, source, status)
                  VALUES (${programme.rows[0].id}, ${faq.q}, ${faq.a}, 'custom', 'coach', 'active')
                `
              }
            }
          }
        }
        migrated++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Migration complete. All tables created. ${migrated} coach(es) migrated.`
    })
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json(
      { error: `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}
