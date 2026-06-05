// app/api/dev/faq-edit/route.ts
// TEMPORARY token-guarded FAQ editor — to swap specific coach FAQ answers (e.g.
// replace asserted August camp dates with a placeholder). Read + targeted update.
//
//   GET  ?token=…&like=august         → list active FAQs whose answer matches
//   POST ?token=…  body {id, answer}  → set one FAQ's answer

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/app/lib/sql'

const DEBUG_TOKEN = 'mca-camp-dbg-7f3a91c2'

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  if (sp.get('token') !== DEBUG_TOKEN) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const like = `%${sp.get('like') || 'august'}%`
  const { rows } = await sql`
    SELECT f.id, p.programme_name, f.question, f.answer, f.status
    FROM faqs f LEFT JOIN programmes p ON p.id = f.programme_id
    WHERE f.answer ILIKE ${like}
    ORDER BY p.programme_name, f.created_at`
  return NextResponse.json({ count: rows.length, rows })
}

export async function POST(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  if (sp.get('token') !== DEBUG_TOKEN) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id, answer } = await request.json()
  if (!id || typeof answer !== 'string') return NextResponse.json({ error: 'id and answer required' }, { status: 400 })
  const { rows } = await sql`
    UPDATE faqs SET answer = ${answer}, updated_at = NOW() WHERE id = ${id}
    RETURNING id, question, answer`
  return NextResponse.json({ updated: rows.length, rows })
}
