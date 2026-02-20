// app/lib/airtable.ts
// SERVER-SIDE ONLY: Never import this in client components (pages).
// All client components call fetch('/api/...') instead.

import Airtable from 'airtable'

const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_TOKEN,
}).base(process.env.NEXT_PUBLIC_AIRTABLE_BASE_ID!)

export const coachesTable = base('Coaches')
export const sessionsTable = base('Sessions')
export const bookingsTable = base('Bookings')

export default base
