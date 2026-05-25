// app/lib/sql.ts
// Drop-in replacement for `import { sql } from '@/app/lib/sql'`.
//
// Why: the @vercel/postgres SDK speaks Neon's serverless HTTP/WebSocket
// protocol and rejects standard Postgres TCP endpoints (self-hosted, RDS,
// Supabase direct, etc.) at the URL-parsing stage. This shim uses the
// standard `pg` driver so the app works against ANY Postgres server.
//
// The exported `sql` supports both call styles used across the codebase:
//   1) sql`SELECT * FROM x WHERE id = ${id}`   — tagged template
//   2) sql.query(text, params)                 — explicit params
// Both return the same `{rows, rowCount, ...}` shape (pg.QueryResult), so
// every existing call site works unchanged after just swapping the import.
//
// SERVER-SIDE ONLY: imports `pg` which is a node-only module.

import { Pool, type QueryResult, type QueryResultRow } from 'pg'

const POSTGRES_URL =
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  ''

let pool: Pool | null = null

function getPool(): Pool {
  if (pool) return pool
  if (!POSTGRES_URL) {
    throw new Error(
      'POSTGRES_URL (or POSTGRES_URL_NON_POOLING / DATABASE_URL) env var is not set'
    )
  }
  // ssl: { rejectUnauthorized: false } accepts self-signed certs (our
  // Contabo Postgres uses a self-signed cert). For Neon / public CA-signed
  // Postgres this still works — the lib won't reject a valid cert just
  // because we relaxed verification. Tighten later by pinning the CA bundle.
  pool = new Pool({
    connectionString: POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })
  pool.on('error', (err) => {
    // Don't crash the whole function on idle-client errors; log + let the
    // next query reconnect.
    console.error('[sql pool] idle client error:', err)
  })
  return pool
}

// Tagged-template: `sql\`SELECT ... ${var}\`` → `SELECT ... $1` with [var]
async function sqlTaggedTemplate<T extends QueryResultRow = QueryResultRow>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<QueryResult<T>> {
  let text = ''
  for (let i = 0; i < strings.length; i++) {
    text += strings[i]
    if (i < values.length) text += `$${i + 1}`
  }
  return getPool().query<T>(text, values as unknown[])
}

// Explicit-params form for dynamic SQL where the call site already built
// the placeholders. Same signature as pg's pool.query() with array params.
async function sqlQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params)
}

// Compose both into a single callable that also has .query — matches the
// @vercel/postgres `sql` shape exactly so call sites need no changes.
type SqlCallable = typeof sqlTaggedTemplate & {
  query: typeof sqlQuery
}

const sqlFn = sqlTaggedTemplate as SqlCallable
sqlFn.query = sqlQuery

export const sql = sqlFn
// trigger redeploy to flush warm function-instance pg.Pool with stale POSTGRES_URL
