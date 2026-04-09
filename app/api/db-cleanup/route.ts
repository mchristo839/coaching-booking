// Temporary cleanup route
import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

export async function POST() {
  try {
    // Delete in order respecting foreign keys
    await sql`DELETE FROM attendance`
    await sql`DELETE FROM payments`
    await sql`DELETE FROM conversations`
    await sql`DELETE FROM members`
    await sql`DELETE FROM faqs`
    await sql`DELETE FROM programmes`
    await sql`DELETE FROM coaches_v2`
    await sql`DELETE FROM providers`
    return NextResponse.json({ success: true, message: 'All records deleted' })
  } catch (error) {
    console.error('Cleanup error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
