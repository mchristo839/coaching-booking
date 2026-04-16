'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface InviteCode {
  code: string
  max_uses: number
  uses: number
  expires_at: string | null
  notes: string | null
  created_at: string
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://coaching-booking-v3.vercel.app'

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
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Invite Codes</h1>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
      )}

      {/* Create new code */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Generate New Code</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max uses</label>
            <input
              type="number"
              min="1"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Paul's referrals"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
            />
          </div>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Generate Code'}
        </button>
      </div>

      {/* Code list */}
      <div className="space-y-3">
        {codes.length === 0 ? (
          <p className="text-gray-500 text-sm">No invite codes yet.</p>
        ) : (
          codes.map((code) => (
            <div key={code.code} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-mono font-bold text-gray-900 text-lg">{code.code}</span>
                  <div className="flex gap-2 mt-1">
                    <span className="text-xs text-gray-500">
                      {code.uses}/{code.max_uses} used
                    </span>
                    {isExpired(code) && (
                      <span className="text-xs text-red-600 font-medium">Expired</span>
                    )}
                    {isMaxed(code) && !isExpired(code) && (
                      <span className="text-xs text-yellow-600 font-medium">Maxed out</span>
                    )}
                    {!isExpired(code) && !isMaxed(code) && (
                      <span className="text-xs text-green-600 font-medium">Active</span>
                    )}
                  </div>
                  {code.notes && (
                    <p className="text-xs text-gray-400 mt-1">{code.notes}</p>
                  )}
                </div>
                <button
                  onClick={() => copyLink(code.code)}
                  disabled={isExpired(code) || isMaxed(code)}
                  className="text-blue-600 text-sm hover:underline disabled:text-gray-400 disabled:no-underline"
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
