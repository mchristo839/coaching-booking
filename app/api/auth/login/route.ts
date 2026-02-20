// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { coachesTable } from '@/app/lib/airtable'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    // Find coach by email
    const records = await coachesTable
      .select({
        filterByFormula: `{email} = '${email}'`,
        maxRecords: 1,
      })
      .firstPage()

    if (records.length === 0) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    const coach = records[0]
    const storedHash = coach.get('password_hash') as string

    // Compare passwords
    const passwordMatch = await bcrypt.compare(password, storedHash)

    if (!passwordMatch) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      coachId: coach.id,
      email: coach.get('email'),
      name: coach.get('name'),
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Login failed. Please try again.' },
      { status: 500 }
    )
  }
}
