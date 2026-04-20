// app/lib/schedule.ts
// Schedule helpers: expand a recurring series into concrete instances,
// overlaid with cancellation/reschedule exceptions.

import { RRule } from 'rrule'
import { getExceptionsForSeries } from '@/app/lib/control-centre-db'

interface SeriesRow {
  id: string
  programme_id: string
  title: string | null
  recurrence_rule: string
  series_start: string
  series_end: string | null
  default_time: string
  default_duration_mins: number
  default_venue: string | null
}

export interface ScheduleInstance {
  series_id: string
  programme_id: string
  date: string              // ISO date YYYY-MM-DD
  starts_at: string         // ISO datetime
  duration_mins: number
  title: string | null
  venue: string | null
  status: 'scheduled' | 'cancelled' | 'rescheduled'
  rescheduled_to: string | null
  reason: string | null
}

/**
 * Expand a series into instances between two dates (inclusive), applying exceptions.
 */
export async function expandSeries(
  series: SeriesRow,
  fromDate: Date,
  toDate: Date
): Promise<ScheduleInstance[]> {
  // Parse RRULE. Support bare rules (FREQ=...) and full iCal lines.
  let rruleText = series.recurrence_rule.trim()
  if (!rruleText.startsWith('RRULE:') && !rruleText.startsWith('DTSTART')) {
    rruleText = `RRULE:${rruleText}`
  }

  const startDateStr = series.series_start
  const startTime = series.default_time
  const dtstart = new Date(`${startDateStr}T${startTime}:00Z`)

  const rule = RRule.fromString(`DTSTART:${dtstart.toISOString().replace(/[-:]/g, '').split('.')[0]}Z\n${rruleText}`)

  const until = series.series_end ? new Date(series.series_end) : toDate
  const dates = rule.between(fromDate, until < toDate ? until : toDate, true)

  // Load exceptions
  const exceptions = await getExceptionsForSeries(series.id, fromDate.toISOString().slice(0, 10))
  const exceptionByDate = new Map<string, typeof exceptions[number]>()
  for (const e of exceptions) {
    exceptionByDate.set(
      new Date(e.original_date).toISOString().slice(0, 10),
      e
    )
  }

  return dates.map((d) => {
    const dateStr = d.toISOString().slice(0, 10)
    const exception = exceptionByDate.get(dateStr)
    return {
      series_id: series.id,
      programme_id: series.programme_id,
      date: dateStr,
      starts_at: d.toISOString(),
      duration_mins: series.default_duration_mins,
      title: series.title,
      venue: series.default_venue,
      status: exception
        ? (exception.status as 'cancelled' | 'rescheduled')
        : 'scheduled',
      rescheduled_to: exception?.rescheduled_to
        ? new Date(exception.rescheduled_to).toISOString()
        : null,
      reason: exception?.reason || null,
    }
  })
}
