// app/lib/urls.ts
// Single source of truth for the public-facing app URL.
//
// Why this exists: several places build shareable links (referral links,
// invite links) using `process.env.NEXT_PUBLIC_APP_URL || <prod fallback>`.
// That pattern breaks when the env var is *set* to a local dev value like
// `http://localhost:3001` — the `||` fallback never fires, and a localhost
// link gets baked into a WhatsApp message that goes out to real parents.
//
// `getPublicAppUrl()` treats empty / localhost / loopback values as "not set"
// and falls back to the production URL, so links sent to guests are always
// real, regardless of how the env var happens to be configured.

// Branded production domain. Use the www host directly — it serves 200, whereas
// the apex 307-redirects to www. Fewer hops = more reliable link previews in
// WhatsApp. The apex still resolves if anyone types it manually.
const PROD_APP_URL = 'https://www.mycoachingassistant.com'

function isLocalUrl(value: string): boolean {
  const v = value.toLowerCase()
  return (
    v.includes('localhost') ||
    v.includes('127.0.0.1') ||
    v.includes('0.0.0.0') ||
    v.includes('[::1]')
  )
}

export function getPublicAppUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '')
  if (!configured || isLocalUrl(configured)) {
    return PROD_APP_URL
  }
  return configured
}
