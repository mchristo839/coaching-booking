// app/api/bookings/attendance/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { updateAttendance } from '@/app/lib/db'

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()

    const updates: { bookingId: string; attendanceStatus: string }[] = body.updates
      ? body.updates
      : [{ bookingId: body.bookingId, attendanceStatus: body.attendanceStatus }]

    if (!updates.length || !updates[0].bookingId) {
      return NextResponse.json(
        { error: 'bookingId and attendanceStatus are required' },
        { status: 400 }
      )
    }

    const validStatuses = ['registered', 'attended', 'no_show']
    const results: { id: string; attendanceStatus: string }[] = []

    for (const u of updates) {
      if (!validStatuses.includes(u.attendanceStatus)) continue
      const row = await updateAttendance(u.bookingId, u.attendanceStatus)
      if (row) {
        results.push({
          id: row.id,
          attendanceStatus: row.attendance_status,
        })
      }
    }

    return NextResponse.json({
      success: true,
      updated: results,
    })
  } catch (error) {
    console.error('[API bookings/attendance] Error:', error)
    return NextResponse.json(
      { error: 'Failed to update attendance' },
      { status: 500 }
    )
  }
}
