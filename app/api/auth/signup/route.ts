// app/api/auth/signup/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { coachesTable } from '@/app/lib/airtable'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const { email, name, password } = await request.json()

    if (!email || !name || !password) {
      return NextResponse.json(
        { error: 'Email, name, and password are required' },
        { status: 400 }
      )
    }

    // Check if coach already exists
    const existing = await coachesTable
      .select({
        filterByFormula: `{email} = '${email}'`,
        maxRecords: 1,
      })
      .firstPage()

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'A coach with this email already exists' },
        { status: 400 }
      )
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, 10)

    // Create the coach record
    const records = await coachesTable.create([
      {
        fields: {
          email,
          name,
          password_hash: passwordHash,
        },
      },
    ])

    const coach = records[0]

    return NextResponse.json({
      success: true,
      coachId: coach.id,
      email: coach.get('email'),
      name: coach.get('name'),
    })
  } catch (error: any) {
  console.error('Signup error full details:', {
    message: error?.message,
    stack: error?.stack,
    name: error?.name,
  })
  return NextResponse.json(
    { error: 'Failed to create account. Please try again.' },
    { status: 500 }
  )
}
