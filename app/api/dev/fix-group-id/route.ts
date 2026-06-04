// app/api/dev/fix-group-id/route.ts
// TEMPORARY token-guarded fix: correct a programme's mistyped WhatsApp group id.
// Scoped — only updates programmes whose group id EXACTLY matches `from`.
//
//   GET  ?token=…&from=…@g.us            → preview which programmes match `from`
//   POST ?token=…&from=…@g.us&to=…@g.us  → set those programmes' group id to `to`

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/app/lib/sql'

const DEBUG_TOKEN = 'mca-camp-dbg-7f3a91c2'

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  if (sp.get('token') !== DEBUG_TOKEN) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const from = sp.get('from') || ''
  const { rows } = await sql`SELECT id, programme_name, whatsapp_group_id FROM programmes WHERE whatsapp_group_id = ${from}`
  return NextResponse.json({ matches: rows.length, rows })
}

export async function POST(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  if (sp.get('token') !== DEBUG_TOKEN) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 })
  // Safety: only accept a plausible WhatsApp group jid as the new value.
  if (!/^120363\d+@g\.us$/.test(to)) {
    return NextResponse.json({ error: `'to' must be a valid group id like 120363...@g.us` }, { status: 400 })
  }
  const { rows } = await sql`
    UPDATE programmes SET whatsapp_group_id = ${to}
    WHERE whatsapp_group_id = ${from}
    RETURNING id, programme_name, whatsapp_group_id
  `
  return NextResponse.json({ updated: rows.length, rows })
}
