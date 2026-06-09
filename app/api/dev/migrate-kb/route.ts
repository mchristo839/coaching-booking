// app/api/dev/migrate-kb/route.ts
//
// One-off helper to backfill a coach's NEW (v2 `programmes`) record from their
// OLD record, after the original v2 migration only copied a subset of fields
// (it dropped session times/duration, payment method, session type and camp
// schedule). Read-only inspect is unguarded for planning; the WRITE is guarded
// by HEALTH_CHECK_SECRET and is NON-DESTRUCTIVE by default (only fills target
// columns that are currently empty). Delete this route once the backfill is done.

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/app/lib/sql'

export const dynamic = 'force-dynamic'

// v2 columns the bot actually reads from (via attachKnowledgebase).
const V2_KB_COLUMNS = [
  'venue_name', 'venue_address', 'specific_age_group', 'target_audience', 'skill_level',
  'session_days', 'session_start_time', 'session_duration', 'session_schedule',
  'price_gbp', 'paid_or_free', 'payment_method', 'payment_methods',
  'session_type', 'camp_schedule', 'what_to_bring', 'cancellation_notice',
  'short_description', 'bot_notes',
]

// ─── GET: inspect (read-only) ───
export async function GET() {
  try {
    const v2 = await sql.query(
      `SELECT id, coach_id, programme_name, whatsapp_group_id, is_active, created_at, updated_at,
        ${V2_KB_COLUMNS.join(', ')}
       FROM programmes ORDER BY created_at`,
    )

    let oldPrograms: { rows: Record<string, unknown>[] } = { rows: [] }
    try {
      oldPrograms = await sql.query(
        `SELECT id, coach_id, program_name, whatsapp_group_id, is_active, knowledgebase, created_at
         FROM programs ORDER BY created_at`,
      )
    } catch (e) {
      oldPrograms = { rows: [{ error: `programs table not readable: ${String(e)}` }] }
    }

    const coachesV2 = await sql.query(`SELECT id, email, first_name, last_name FROM coaches_v2`)
    let oldCoaches: { rows: Record<string, unknown>[] } = { rows: [] }
    try {
      oldCoaches = await sql.query(`SELECT id, email, name FROM coaches`)
    } catch { /* table may not exist */ }

    return NextResponse.json({
      v2_programmes: v2.rows,
      old_programs: oldPrograms.rows,
      coaches_v2: coachesV2.rows,
      old_coaches: oldCoaches.rows,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v)
}
function isEmpty(v: unknown): boolean {
  if (v == null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

// Build a normalised {v2_column: value} map from a source row.
// Source can be a v2 `programmes` row (same columns) or an old `programs` row
// (whose knowledgebase JSONB uses the old field names).
function sourceToV2(source: Record<string, unknown>, sourceTable: 'programmes' | 'programs'): Record<string, unknown> {
  if (sourceTable === 'programmes') {
    const out: Record<string, unknown> = {}
    for (const col of V2_KB_COLUMNS) out[col] = source[col]
    return out
  }
  // old programs → knowledgebase jsonb
  const kb = (source.knowledgebase as Record<string, unknown>) || {}
  const out: Record<string, unknown> = {
    venue_name: kb.venue,
    venue_address: kb.venueAddress,
    specific_age_group: kb.ageGroup,
    target_audience: kb.sport,
    skill_level: kb.skillLevel,
    session_duration: kb.duration,
    price_gbp: kb.priceCents != null ? Number(kb.priceCents) / 100 : undefined,
    payment_method: kb.paymentMethod,
    session_type: kb.sessionType,
    camp_schedule: kb.campSchedule,
    what_to_bring: kb.whatToBring,
    cancellation_notice: kb.cancellationPolicy,
    short_description: kb.coachBio,
    bot_notes: kb.medicalInfo,
  }
  // Free-text schedule has no single v2 column (v2 wants session_days +
  // session_start_time + session_duration). Surface it so it isn't silently lost.
  if (!isEmpty(kb.schedule)) out.__schedule_freetext = kb.schedule
  return out
}

// ─── POST: backfill (guarded) ───
// Body: { sourceTable: 'programmes'|'programs', sourceId, targetId, dryRun?: true, overwrite?: false, copyFaqs?: true }
export async function POST(request: NextRequest) {
  const secret = process.env.HEALTH_CHECK_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  try {
    const body = await request.json()

    // ── Direct set mode: write explicit {column: value} pairs onto a target ──
    // Used to fix data-entry errors (e.g. a corrupted venue_address) and fill
    // genuinely-empty bot fields (camp_schedule, payment_method) that aren't
    // present in any source record. Allowlisted columns only. dryRun by default.
    if (body.set && typeof body.set === 'object') {
      const targetId = String(body.targetId || '')
      const dryRun = body.dryRun !== false
      if (!targetId) return NextResponse.json({ error: 'targetId required' }, { status: 400 })
      const tgt = await sql.query(`SELECT * FROM programmes WHERE id = $1`, [targetId])
      if (tgt.rows.length === 0) return NextResponse.json({ error: 'target not found' }, { status: 404 })
      const target = tgt.rows[0]

      const setObj = body.set as Record<string, unknown>
      const cols = Object.keys(setObj).filter((c) => V2_KB_COLUMNS.includes(c))
      const rejected = Object.keys(setObj).filter((c) => !V2_KB_COLUMNS.includes(c))
      const changes: Record<string, { from: unknown; to: unknown }> = {}
      for (const c of cols) changes[c] = { from: target[c], to: setObj[c] }

      if (dryRun) {
        return NextResponse.json({ dryRun: true, mode: 'set', targetId, changes, rejectedColumns: rejected, note: 'Nothing written. Re-POST with "dryRun": false to apply.' })
      }
      if (cols.length > 0) {
        const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(', ')
        await sql.query(`UPDATE programmes SET ${sets}, updated_at = NOW() WHERE id = $${cols.length + 1}`, [...cols.map((c) => setObj[c]), targetId])
      }
      return NextResponse.json({ applied: true, mode: 'set', targetId, updatedColumns: cols, rejectedColumns: rejected })
    }

    const sourceTable: 'programmes' | 'programs' = body.sourceTable === 'programs' ? 'programs' : 'programmes'
    const sourceId = String(body.sourceId || '')
    const targetId = String(body.targetId || '')
    const dryRun = body.dryRun !== false // default true — must explicitly pass false to write
    const overwrite = body.overwrite === true
    const copyFaqs = body.copyFaqs !== false

    if (!sourceId || !targetId) {
      return NextResponse.json({ error: 'sourceId and targetId are required' }, { status: 400 })
    }

    const srcRes = await sql.query(`SELECT * FROM ${sourceTable} WHERE id = $1`, [sourceId])
    const tgtRes = await sql.query(`SELECT * FROM programmes WHERE id = $1`, [targetId])
    if (srcRes.rows.length === 0) return NextResponse.json({ error: 'source not found' }, { status: 404 })
    if (tgtRes.rows.length === 0) return NextResponse.json({ error: 'target not found' }, { status: 404 })

    const source = srcRes.rows[0]
    const target = tgtRes.rows[0]
    const mapped = sourceToV2(source, sourceTable)

    const planned: Record<string, { from: unknown; to: unknown }> = {}
    const skipped: Record<string, string> = {}
    const scheduleFreetext = mapped.__schedule_freetext
    delete mapped.__schedule_freetext

    for (const [col, value] of Object.entries(mapped)) {
      if (isEmpty(value)) continue // nothing useful in the source
      if (!overwrite && !isEmpty(target[col])) {
        skipped[col] = `target already has a value (${JSON.stringify(target[col])})`
        continue
      }
      planned[col] = { from: target[col], to: value }
    }

    // Copy FAQs (old programs: kb.customFaqs; v2 source: its faqs rows).
    let faqsToCopy: { q: string; a: string }[] = []
    if (copyFaqs) {
      if (sourceTable === 'programs') {
        const kb = (source.knowledgebase as Record<string, unknown>) || {}
        const arr = Array.isArray(kb.customFaqs) ? (kb.customFaqs as { q?: string; a?: string }[]) : []
        faqsToCopy = arr.filter((f) => f.q && f.a).map((f) => ({ q: String(f.q), a: String(f.a) }))
      } else {
        const f = await sql.query(`SELECT question, answer FROM faqs WHERE programme_id = $1 AND status = 'active'`, [sourceId])
        faqsToCopy = f.rows.map((r) => ({ q: String(r.question), a: String(r.answer) }))
      }
    }

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        sourceTable, sourceId, targetId,
        plannedUpdates: planned,
        skipped,
        scheduleFreetext: scheduleFreetext ?? null,
        faqsToCopy,
        note: 'Nothing written. Re-POST with "dryRun": false to apply.',
      })
    }

    // Apply.
    const cols = Object.keys(planned)
    if (cols.length > 0) {
      const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(', ')
      const vals = cols.map((c) => planned[c].to)
      await sql.query(
        `UPDATE programmes SET ${sets}, updated_at = NOW() WHERE id = $${cols.length + 1}`,
        [...vals, targetId],
      )
    }

    let faqsInserted = 0
    if (copyFaqs && faqsToCopy.length > 0) {
      const existing = await sql.query(`SELECT question FROM faqs WHERE programme_id = $1`, [targetId])
      const have = new Set(existing.rows.map((r) => clean(r.question).toLowerCase()))
      for (const f of faqsToCopy) {
        if (have.has(f.q.toLowerCase())) continue
        await sql.query(
          `INSERT INTO faqs (programme_id, question, answer, category, source, status) VALUES ($1, $2, $3, 'custom', 'coach', 'active')`,
          [targetId, f.q, f.a],
        )
        faqsInserted++
      }
    }

    return NextResponse.json({
      applied: true,
      updatedColumns: cols,
      skipped,
      scheduleFreetext: scheduleFreetext ?? null,
      faqsInserted,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
