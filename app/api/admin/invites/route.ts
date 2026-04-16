// app/api/admin/invites/route.ts
// Admin-only API for managing invite codes.

import { NextRequest, NextResponse } from 'next/server'
import { createInviteCode, listInviteCodes } from '@/app/lib/db'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || ''

function isAdmin(request: NextRequest): boolean {
  const email = request.headers.get('x-admin-email') || ''
  return email === ADMIN_EMAIL && ADMIN_EMAIL !== ''
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I/O/0/1 for readability
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// GET — list all invite codes
export async function GET(request: NextRequest) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  try {
    const codes = await listInviteCodes()
    return NextResponse.json({ codes })
  } catch (error) {
    console.error('List invites error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// POST — create a new invite code
export async function POST(request: NextRequest) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const maxUses = body.maxUses || 1
    const notes = body.notes || null
    const expiresAt = body.expiresAt || null
    const code = generateCode()

    const invite = await createInviteCode(code, ADMIN_EMAIL, maxUses, expiresAt, notes)
    return NextResponse.json({ invite })
  } catch (error) {
    console.error('Create invite error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
