// app/lib/ical.ts
// Minimal RFC-5545 iCalendar generator for booking confirmations.
// One VEVENT per call — that's all we need for PT session invites.
// Returns the .ics body as a string; the email layer base64-encodes it
// into an attachment.

interface IcalEvent {
  uid: string                    // unique stable id (use pt_session.id)
  start: Date
  end: Date
  summary: string                // event title
  description?: string
  location?: string
  organizer_email?: string
  organizer_name?: string
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function formatICalDate(d: Date): string {
  // YYYYMMDDTHHMMSSZ in UTC
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  )
}

function escapeText(s: string): string {
  // Per RFC-5545 §3.3.11 — escape backslash, semicolon, comma, newline
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export function buildIcs(evt: IcalEvent): string {
  const lines: string[] = []
  lines.push('BEGIN:VCALENDAR')
  lines.push('VERSION:2.0')
  lines.push('PRODID:-//MyCoachingAssistant//EN')
  lines.push('METHOD:REQUEST')
  lines.push('BEGIN:VEVENT')
  lines.push(`UID:${evt.uid}@mycoachingassistant.com`)
  lines.push(`DTSTAMP:${formatICalDate(new Date())}`)
  lines.push(`DTSTART:${formatICalDate(evt.start)}`)
  lines.push(`DTEND:${formatICalDate(evt.end)}`)
  lines.push(`SUMMARY:${escapeText(evt.summary)}`)
  if (evt.description) lines.push(`DESCRIPTION:${escapeText(evt.description)}`)
  if (evt.location) lines.push(`LOCATION:${escapeText(evt.location)}`)
  if (evt.organizer_email) {
    const orgName = evt.organizer_name ? `CN=${escapeText(evt.organizer_name)}:` : ''
    lines.push(`ORGANIZER;${orgName}mailto:${evt.organizer_email}`)
  }
  lines.push('STATUS:CONFIRMED')
  lines.push('TRANSP:OPAQUE')
  lines.push('END:VEVENT')
  lines.push('END:VCALENDAR')
  // RFC-5545 line endings are CRLF
  return lines.join('\r\n') + '\r\n'
}
