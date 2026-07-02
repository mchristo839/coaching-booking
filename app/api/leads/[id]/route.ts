// app/api/leads/[id]/route.ts
// PATCH — update a lead's stage and/or editable fields.
// DELETE — remove a lead.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import {
  deleteLead,
  getLeadForCoach,
  setLeadStage,
  updateLead,
  LEAD_STAGES,
  type LeadSource,
  type LeadStage,
} from '@/app/lib/leads'

const VALID_SOURCES: LeadSource[] = ['website', 'email_phone', 'calendly', 'meta', 'other']

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
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

  // Moving stage is a distinct action (stamps stage_changed_at) from
  // editing the lead's own fields — but a request may do both.
  if (typeof body.stage === 'string') {
    if (!LEAD_STAGES.includes(body.stage as LeadStage)) {
      return NextResponse.json({ error: `Invalid stage. Must be one of: ${LEAD_STAGES.join(', ')}` }, { status: 400 })
    }
    const moved = await setLeadStage(params.id, auth.coachId, body.stage as LeadStage)
    if (!moved) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  const hasFieldEdit =
    body.name !== undefined ||
    body.phone !== undefined ||
    body.email !== undefined ||
    body.source !== undefined ||
    body.trialDate !== undefined ||
    body.notes !== undefined

  if (hasFieldEdit) {
    if (body.source !== undefined && !VALID_SOURCES.includes(body.source as LeadSource)) {
      return NextResponse.json({ error: `Invalid source. Must be one of: ${VALID_SOURCES.join(', ')}` }, { status: 400 })
    }
    const updated = await updateLead(params.id, auth.coachId, {
      name: typeof body.name === 'string' ? body.name.trim() : undefined,
      phone: body.phone === null ? null : typeof body.phone === 'string' ? body.phone.trim() : undefined,
      email: body.email === null ? null : typeof body.email === 'string' ? body.email.trim() : undefined,
      source: body.source as LeadSource | undefined,
      trialDate: body.trialDate === null ? null : typeof body.trialDate === 'string' ? body.trialDate : undefined,
      notes: body.notes === null ? null : typeof body.notes === 'string' ? body.notes.trim() : undefined,
    })
    if (!updated) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    return NextResponse.json({ lead: updated })
  }

  const lead = await getLeadForCoach(params.id, auth.coachId)
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  return NextResponse.json({ lead })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const ok = await deleteLead(params.id, auth.coachId)
  if (!ok) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
