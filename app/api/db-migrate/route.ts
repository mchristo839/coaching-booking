// Migration route — idempotent, safe to run multiple times.
// Hit POST /api/db-migrate after deploying.
// Contains both V2 schema (providers/coaches_v2/programmes) and
// Week 1 operational tables (conversations, bot_replies, etc).
import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

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

    // Tester flags on coaches (old table, still used by current auth)
    await sql`
      ALTER TABLE coaches
      ADD COLUMN IF NOT EXISTS invite_code TEXT
    `
    await sql`
      ALTER TABLE coaches
      ADD COLUMN IF NOT EXISTS is_tester BOOLEAN DEFAULT FALSE
    `

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
