// app/api/bookings/attendance/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { bookingsTable } from '@/app/lib/airtable'

// PATCH: Update attendance for one or many bookings
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()

    // Support both single and bulk updates
    // Single: { bookingId: "xxx", attendanceStatus: "attended" }
    // Bulk: { updates: [{ bookingId: "xxx", attendanceStatus: "attended" }, ...] }
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
    const results: { id: string; attendanceStatus: unknown }[] = []

    // Airtable update() supports up to 10 records at a time
    for (let i = 0; i < updates.length; i += 10) {
      const batch = updates.slice(i, i + 10)

      const updateRecords = batch
        .filter((u) => validStatuses.includes(u.attendanceStatus))
        .map((u) => ({
          id: u.bookingId,
          fields: { attendance_status: u.attendanceStatus },
        }))

      if (updateRecords.length > 0) {
        const updated = await bookingsTable.update(updateRecords)
        updated.forEach((r) => {
          results.push({
            id: r.id,
            attendanceStatus: r.get('attendance_status'),
          })
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
