'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getPublicAppUrl } from '@/app/lib/urls'

interface InviteCode {
  code: string
  max_uses: number
  uses: number
  expires_at: string | null
  notes: string | null
  created_at: string
}

const APP_URL = getPublicAppUrl()

export default function AdminInvitesPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [codes, setCodes] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  // Form state for new invite
  const [maxUses, setMaxUses] = useState('5')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    const adminEmail = localStorage.getItem('coachEmail') || ''
    setEmail(adminEmail)

    if (!adminEmail) {
      router.push('/auth/login')
      return
    }

    fetchCodes(adminEmail)
  }, [router])

  async function fetchCodes(adminEmail: string) {
    try {
      const res = await fetch('/api/admin/invites', {
        headers: { 'x-admin-email': adminEmail },
      })
      if (res.status === 401) {
        setError('Not authorised. Admin access required.')
        setLoading(false)
        return
      }
      const data = await res.json()
      setCodes(data.codes || [])
    } catch {
      setError('Failed to load invite codes')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    setCreating(true)
    setError('')

    try {
      const res = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': email,
        },
        body: JSON.stringify({
          maxUses: parseInt(maxUses) || 1,
          notes: notes.trim() || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to create code')
        return
      }

      setNotes('')
      fetchCodes(email)
    } catch {
      setError('Failed to create invite code')
    } finally {
      setCreating(false)
    }
  }

  function copyLink(code: string) {
    const link = `${APP_URL}/auth/signup?invite=${code}`
    navigator.clipboard.writeText(link)
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  function isExpired(code: InviteCode): boolean {
    if (!code.expires_at) return false
    return new Date(code.expires_at) < new Date()
  }

  function isMaxed(code: InviteCode): boolean {
    return code.uses >= code.max_uses
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <p className="text-ink-muted">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-canvas px-4 py-8 md:px-8 max-w-3xl mx-auto">
      <h1 className="reveal reveal-1 font-display text-2xl font-bold text-ink mb-6">Invite Codes</h1>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm border border-red-100">{error}</div>
      )}

      {/* Create new code */}
      <div className="card shadow-card mb-6 space-y-4">
        <h2 className="font-display text-lg font-semibold text-ink">Generate New Code</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Max uses</label>
            <input
              type="number"
              min="1"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Paul's referrals"
              className="input-field"
            />
          </div>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="btn-primary"
        >
          {creating ? 'Creating...' : 'Generate Code'}
        </button>
      </div>

      {/* Code list */}
      <div className="space-y-3">
        {codes.length === 0 ? (
          <p className="text-ink-muted text-sm">No invite codes yet.</p>
        ) : (
          codes.map((code) => (
            <div key={code.code} className="bg-surface rounded-xl border border-line shadow-card p-4 transition-all duration-200 hover:shadow-card-hover">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-mono font-bold text-ink text-lg">{code.code}</span>
                  <div className="flex gap-2 mt-1">
                    <span className="text-xs text-ink-muted">
                      {code.uses}/{code.max_uses} used
                    </span>
                    {isExpired(code) && (
                      <span className="text-xs text-red-600 font-medium">Expired</span>
                    )}
                    {isMaxed(code) && !isExpired(code) && (
                      <span className="text-xs text-amber-600 font-medium">Maxed out</span>
                    )}
                    {!isExpired(code) && !isMaxed(code) && (
                      <span className="text-xs text-brand-700 font-medium">Active</span>
                    )}
                  </div>
                  {code.notes && (
                    <p className="text-xs text-ink-muted mt-1">{code.notes}</p>
                  )}
                </div>
                <button
                  onClick={() => copyLink(code.code)}
                  disabled={isExpired(code) || isMaxed(code)}
                  className="text-brand-700 text-sm font-medium hover:underline disabled:text-ink-muted/50 disabled:no-underline"
                >
                  {copied === code.code ? 'Copied!' : 'Copy link'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
