export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

// GET: list FAQs (pending for coach, or all for a programme)
export async function GET(request: NextRequest) {
  try {
    const coachId = request.nextUrl.searchParams.get('coachId')
    const programmeId = request.nextUrl.searchParams.get('programmeId')
    const status = request.nextUrl.searchParams.get('status')

    if (coachId && !programmeId) {
      // Get pending FAQs across all coach's programmes
      const { rows } = await sql.query(`
        SELECT f.*, p.programme_name
        FROM faqs f
        JOIN programmes p ON p.id = f.programme_id
        WHERE p.coach_id = $1 AND f.status = 'pending_coach_approval'
        ORDER BY f.created_at DESC
      `, [coachId])
      return NextResponse.json({ faqs: rows })
    }

    if (programmeId) {
      if (status) {
        const { rows } = await sql.query(
          'SELECT * FROM faqs WHERE programme_id = $1 AND status = $2 ORDER BY created_at',
          [programmeId, status]
        )
        return NextResponse.json({ faqs: rows })
      }
      const { rows } = await sql.query(
        'SELECT * FROM faqs WHERE programme_id = $1 ORDER BY created_at',
        [programmeId]
      )
      return NextResponse.json({ faqs: rows })
    }

    return NextResponse.json({ error: 'coachId or programmeId required' }, { status: 400 })
  } catch (error) {
    console.error('List FAQs error:', error)
    return NextResponse.json({ error: 'Failed to list FAQs' }, { status: 500 })
  }
}

// POST: create a new FAQ
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { programmeId, question, answer, category, source, status } = body

    if (!programmeId || !question || !answer) {
      return NextResponse.json({ error: 'Programme ID, question and answer required' }, { status: 400 })
    }

    const { rows } = await sql.query(
      `INSERT INTO faqs (programme_id, question, answer, category, source, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [programmeId, question, answer, category || 'custom', source || 'coach', status || 'active']
    )
    return NextResponse.json({ success: true, faq: rows[0] })
  } catch (error) {
    console.error('Create FAQ error:', error)
    return NextResponse.json({ error: 'Failed to create FAQ' }, { status: 500 })
  }
}

// PATCH: update/approve a FAQ
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    // Accept both "id" (frontend sends this) and "faqId" for backwards compat
    const id = body.id || body.faqId
    const { question, answer, status } = body

    if (!id) {
      return NextResponse.json({ error: 'FAQ ID required' }, { status: 400 })
    }

    // Use sql.query() directly to avoid stale read replica
    if (question !== undefined) {
      await sql.query('UPDATE faqs SET question = $1, updated_at = NOW() WHERE id = $2', [question, id])
    }
    if (answer !== undefined) {
      await sql.query('UPDATE faqs SET answer = $1, updated_at = NOW() WHERE id = $2', [answer, id])
    }
    if (status !== undefined) {
      await sql.query('UPDATE faqs SET status = $1, updated_at = NOW() WHERE id = $2', [status, id])
    }

    const { rows } = await sql.query('SELECT * FROM faqs WHERE id = $1', [id])
    return NextResponse.json({ success: true, faq: rows[0] })
  } catch (error) {
    console.error('Update FAQ error:', error)
    return NextResponse.json({ error: 'Failed to update FAQ' }, { status: 500 })
  }
}

// DELETE: remove a FAQ
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'FAQ ID required' }, { status: 400 })
    }

    await sql.query('DELETE FROM faqs WHERE id = $1', [id])
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete FAQ error:', error)
    return NextResponse.json({ error: 'Failed to delete FAQ' }, { status: 500 })
  }
}
