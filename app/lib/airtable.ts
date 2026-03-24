// app/lib/airtable.ts
// SERVER-SIDE ONLY: Never import this in client components (pages).
// All client components call fetch('/api/...') instead.
//
// This replaces the `airtable` npm SDK with direct fetch() calls
// to fix the hanging issue caused by SDK + Node 18/20 incompatibility.

const AIRTABLE_TOKEN = process.env.AIRTABLE_API_TOKEN!
const AIRTABLE_BASE_ID = process.env.NEXT_PUBLIC_AIRTABLE_BASE_ID!
const API_BASE = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`

function headers() {
  return {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

// Minimal record type matching what the old SDK returned
export interface AirtableRecord {
  id: string
  fields: Record<string, unknown>
  get(fieldName: string): unknown
}

function wrapRecord(raw: { id: string; fields: Record<string, unknown> }): AirtableRecord {
  return {
    id: raw.id,
    fields: raw.fields,
    get(fieldName: string) {
      return raw.fields[fieldName]
    },
  }
}

// Builds a query-string from select() options
function buildSelectParams(opts?: {
  filterByFormula?: string
  maxRecords?: number
  sort?: { field: string; direction: 'asc' | 'desc' }[]
}): string {
  const params = new URLSearchParams()
  if (opts?.filterByFormula) params.set('filterByFormula', opts.filterByFormula)
  if (opts?.maxRecords) params.set('maxRecords', String(opts.maxRecords))
  if (opts?.sort) {
    opts.sort.forEach((s, i) => {
      params.set(`sort[${i}][field]`, s.field)
      params.set(`sort[${i}][direction]`, s.direction)
    })
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

function createTable(tableName: string) {
  const tableUrl = `${API_BASE}/${encodeURIComponent(tableName)}`

  return {
    // .select(opts).firstPage() replacement
    select(opts?: {
      filterByFormula?: string
      maxRecords?: number
      sort?: { field: string; direction: 'asc' | 'desc' }[]
    }) {
      return {
        async firstPage(): Promise<AirtableRecord[]> {
          const qs = buildSelectParams(opts)
          const res = await fetch(`${tableUrl}${qs}`, { method: 'GET', headers: headers() })
          if (!res.ok) {
            const body = await res.text()
            throw new Error(`Airtable select failed (${res.status}): ${body}`)
          }
          const data = await res.json()
          return (data.records || []).map(wrapRecord)
        },
      }
    },

    // .find(recordId)
    async find(recordId: string): Promise<AirtableRecord> {
      const res = await fetch(`${tableUrl}/${recordId}`, { method: 'GET', headers: headers() })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Airtable find failed (${res.status}): ${body}`)
      }
      const data = await res.json()
      return wrapRecord(data)
    },

    // .create(records) - array of { fields: {...} }
    async create(records: { fields: Record<string, unknown> }[]): Promise<AirtableRecord[]> {
      const res = await fetch(tableUrl, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ records }),
      })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Airtable create failed (${res.status}): ${body}`)
      }
      const data = await res.json()
      return (data.records || []).map(wrapRecord)
    },

    // .update() - two signatures:
    //   update(recordId, fields) - single record
    //   update(records) - array of { id, fields }
    async update(
      recordIdOrRecords: string | { id: string; fields: Record<string, unknown> }[],
      fields?: Record<string, unknown>
    ): Promise<AirtableRecord[] | AirtableRecord> {
      // Single record update: update("recXYZ", { field: value })
      if (typeof recordIdOrRecords === 'string') {
        const res = await fetch(`${tableUrl}/${recordIdOrRecords}`, {
          method: 'PATCH',
          headers: headers(),
          body: JSON.stringify({ fields }),
        })
        if (!res.ok) {
          const body = await res.text()
          throw new Error(`Airtable update failed (${res.status}): ${body}`)
        }
        const data = await res.json()
        return wrapRecord(data)
      }

      // Bulk update: update([{ id, fields }, ...])
      const records = recordIdOrRecords
      const res = await fetch(tableUrl, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ records }),
      })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Airtable update failed (${res.status}): ${body}`)
      }
      const data = await res.json()
      return (data.records || []).map(wrapRecord)
    },
  }
}

export const coachesTable = createTable('Coaches')
export const sessionsTable = createTable('Sessions')
export const bookingsTable = createTable('Bookings')

const base = { coachesTable, sessionsTable, bookingsTable }
export default base
