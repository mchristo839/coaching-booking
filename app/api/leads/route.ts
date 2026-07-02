// app/api/leads/route.ts
// GET  — list the authenticated coach's leads.
// POST — create a lead (manual/form intake).

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { createLead, listLeadsByCoach, type LeadSource } from '@/app/lib/leads'

const VALID_SOURCES: LeadSource[] = ['website', 'email_phone', 'calendly', 'meta', 'other']

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const leads = await listLeadsByCoach(auth.coachId)
  return NextResponse.json({ leads })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  const source = VALID_SOURCES.includes(body.source as LeadSource) ? (body.source as LeadSource) : 'other'

  const lead = await createLead({
    coachId: auth.coachId,
    name,
    phone: typeof body.phone === 'string' ? body.phone.trim() || null : null,
    email: typeof body.email === 'string' ? body.email.trim() || null : null,
    source,
    trialDate: typeof body.trialDate === 'string' ? body.trialDate : null,
    notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
  })

  return NextResponse.json({ lead }, { status: 201 })
}
