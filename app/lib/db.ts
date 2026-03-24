// app/lib/db.ts
// SERVER-SIDE ONLY: Never import this in client components.
// All client components call fetch('/api/...') instead.

import { sql } from '@vercel/postgres'

// ─── Coaches ───

export async function findCoachByEmail(email: string) {
  const { rows } = await sql`
    SELECT * FROM coaches WHERE email = ${email} LIMIT 1
  `
  return rows[0] || null
}

export async function createCoach(email: string, name: string, passwordHash: string) {
  const { rows } = await sql`
    INSERT INTO coaches (email, name, password_hash)
    VALUES (${email}, ${name}, ${passwordHash})
    RETURNING *
  `
  return rows[0]
}

// ─── Sessions ───

export async function createSessions(
  records: {
    coach_id: string
    session_name: string
    session_type: string
    date_time: string
    duration_minutes: number
    capacity: number
    age_group: string
    skill_level: string
    price_cents: number
    injury_notes: string
    recurrence_rule: string
    recurrence_end_date?: string
  }[]
) {
  const ids: string[] = []
  for (const r of records) {
    const { rows } = await sql`
      INSERT INTO sessions (
        coach_id, session_name, session_type, date_time,
        duration_minutes, capacity, age_group, skill_level,
        price_cents, injury_notes, recurrence_rule, recurrence_end_date
      ) VALUES (
        ${r.coach_id}, ${r.session_name}, ${r.session_type}, ${r.date_time},
        ${r.duration_minutes}, ${r.capacity}, ${r.age_group}, ${r.skill_level},
        ${r.price_cents}, ${r.injury_notes}, ${r.recurrence_rule},
        ${r.recurrence_end_date || null}
      )
      RETURNING id
    `
    ids.push(rows[0].id)
  }
  return ids
}

export async function listSessionsByCoach(coachId: string) {
  const { rows } = await sql`
    SELECT s.*, COALESCE(b.booked_count, 0) AS booked_count
    FROM sessions s
    LEFT JOIN (
      SELECT session_id, COUNT(*) AS booked_count FROM bookings GROUP BY session_id
    ) b ON b.session_id = s.id
    WHERE s.coach_id = ${coachId}
    ORDER BY s.date_time ASC
  `
  return rows
}

export async function listAvailableSessions(coachId: string) {
  const { rows } = await sql`
    SELECT s.*, COALESCE(b.booked_count, 0) AS booked_count
    FROM sessions s
    LEFT JOIN (
      SELECT session_id, COUNT(*) AS booked_count FROM bookings GROUP BY session_id
    ) b ON b.session_id = s.id
    WHERE s.coach_id = ${coachId}
      AND s.date_time > NOW()
      AND COALESCE(b.booked_count, 0) < s.capacity
    ORDER BY s.date_time ASC
  `
  return rows
}

export async function findSession(sessionId: string) {
  const { rows } = await sql`
    SELECT s.*, COALESCE(b.booked_count, 0) AS booked_count
    FROM sessions s
    LEFT JOIN (
      SELECT session_id, COUNT(*) AS booked_count FROM bookings GROUP BY session_id
    ) b ON b.session_id = s.id
    WHERE s.id = ${sessionId}
  `
  return rows[0] || null
}

// ─── Bookings ───

export async function createBooking(fields: {
  session_id: string
  user_name: string
  user_email: string
  user_phone: string
  medical_info: string
  consent_given: boolean
  payment_status: string
  payment_method: string
  attendance_status: string
}) {
  const f = fields
  const { rows } = await sql`
    INSERT INTO bookings (
      session_id, user_name, user_email, user_phone,
      medical_info, consent_given, payment_status,
      payment_method, attendance_status
    ) VALUES (
      ${f.session_id}, ${f.user_name}, ${f.user_email}, ${f.user_phone},
      ${f.medical_info}, ${f.consent_given}, ${f.payment_status},
      ${f.payment_method}, ${f.attendance_status}
    )
    RETURNING *
  `
  return rows[0]
}

export async function listBookingsByCoach(coachId: string) {
  const { rows } = await sql`
    SELECT b.*
    FROM bookings b
    JOIN sessions s ON s.id = b.session_id
    WHERE s.coach_id = ${coachId}
    ORDER BY b.created_at DESC
  `
  return rows
}

export async function listBookingsBySession(sessionId: string) {
  const { rows } = await sql`
    SELECT * FROM bookings WHERE session_id = ${sessionId}
  `
  return rows
}

export async function updateAttendance(bookingId: string, status: string) {
  const { rows } = await sql`
    UPDATE bookings SET attendance_status = ${status}
    WHERE id = ${bookingId}
    RETURNING id, attendance_status
  `
  return rows[0]
}

export async function updateBookingPayment(bookingId: string, paymentStatus: string, stripePaymentIntentId: string) {
  const { rows } = await sql`
    UPDATE bookings
    SET payment_status = ${paymentStatus},
        stripe_payment_intent_id = ${stripePaymentIntentId}
    WHERE id = ${bookingId}
    RETURNING *
  `
  return rows[0]
}
