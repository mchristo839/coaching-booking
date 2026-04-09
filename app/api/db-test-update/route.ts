export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

export async function POST() {
  try {
    // Simple direct UPDATE
    const result = await sql`
      UPDATE programmes
      SET venue_name = 'DIRECT SQL TEST', updated_at = NOW()
      WHERE id = 'b1d29730-f50d-4ca0-8e50-8089b06db9e5'
      RETURNING venue_name, updated_at
    `
    // Read it back immediately
    const readBack = await sql`
      SELECT venue_name, updated_at FROM programmes
      WHERE id = 'b1d29730-f50d-4ca0-8e50-8089b06db9e5'
    `
    return NextResponse.json({
      updateRows: result.rows,
      updateRowCount: result.rowCount,
      readBackRows: readBack.rows,
      match: result.rows[0]?.venue_name === readBack.rows[0]?.venue_name
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
