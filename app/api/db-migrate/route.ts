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
    await sql`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        programme_id UUID REFERENCES programmes(id),
        coach_id UUID REFERENCES coaches_v2(id),
        sender_name VARCHAR(200),
        sender_identifier VARCHAR(255),
        sender_type VARCHAR(30),
        channel VARCHAR(20) NOT NULL,
        message_text TEXT NOT NULL,
        category VARCHAR(50),
        bot_response TEXT,
        bot_mode VARCHAR(20),
        score VARCHAR(20),
        escalated BOOLEAN DEFAULT false,
        escalation_type VARCHAR(30),
        member_id UUID REFERENCES members(id),
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
      message: `Migration complete. 9 tables created. ${migrated} coach(es) migrated.`
    })
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json(
      { error: `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}
