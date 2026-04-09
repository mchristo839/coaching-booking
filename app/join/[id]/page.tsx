'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Programme {
  id: string
  programme_name: string
  short_description: string | null
  target_audience: string | null
  specific_age_group: string | null
  skill_level: string | null
  programme_type: string | null
  session_days: string[] | null
  session_start_time: string | null
  session_duration: string | null
  session_frequency: string | null
  holiday_schedule: string | null
  venue_name: string | null
  venue_address: string | null
  indoor_outdoor: string | null
  parking: string | null
  nearest_transport: string | null
  trial_available: string | null
  trial_instructions: string | null
  what_to_bring: string | null
  equipment_provided: string | null
  kit_required: string | null
  kit_details: string | null
  paid_or_free: string | null
  payment_model: string | null
  price_gbp: number | null
  price_includes: string | null
  sibling_discount: string | null
  payment_methods: string[] | null
  coach_first_name: string
  coach_last_name: string
  sport: string | null
  coaching_level: string | null
  dbs_status: string | null
  first_aid: string | null
  trading_name: string | null
  activeMemberCount: number
  spotsLeft: number | null
  isFull: boolean
  waitlist_enabled: boolean
  waitlistCount: number
  programme_status: string | null
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function JoinPage() {
  const params = useParams()
  const programmeId = params.id as string

  const [prog, setProg] = useState<Programme | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Form state
  const [parentName, setParentName] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [childName, setChildName] = useState('')
  const [childDob, setChildDob] = useState('')
  const [medicalNotes, setMedicalNotes] = useState('')
  const [agreed, setAgreed] = useState(false)

  // Submission
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<{
    message: string
    status: string
    waitlistPosition: number | null
  } | null>(null)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (!programmeId) return
    fetch(`/api/programmes/public?id=${encodeURIComponent(programmeId)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Programme not found')
        return res.json()
      })
      .then((data) => setProg(data.programme))
      .catch(() => setError('This programme could not be found. It may have been removed or the link is incorrect.'))
      .finally(() => setLoading(false))
  }, [programmeId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!parentName.trim()) return
    setSubmitting(true)
    setSubmitError('')

    try {
      const res = await fetch('/api/members/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programmeId,
          parentName: parentName.trim(),
          parentEmail: parentEmail.trim() || null,
          parentPhone: parentPhone.trim() || null,
          childName: childName.trim() || null,
          childDob: childDob || null,
          medicalNotes: medicalNotes.trim() || null,
          source: 'web',
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setSubmitError(data.message || data.error || 'Something went wrong')
        return
      }

      setSuccess({
        message: data.message,
        status: data.status,
        waitlistPosition: data.waitlistPosition,
      })
    } catch {
      setSubmitError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Loading ───
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#3D8B37] border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading programme...</p>
        </div>
      </div>
    )
  }

  // ─── Error ───
  if (error || !prog) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Programme Not Found</h1>
          <p className="text-gray-500 text-sm">{error || 'This programme could not be found.'}</p>
        </div>
      </div>
    )
  }

  const coachName = `${prog.coach_first_name} ${prog.coach_last_name}`.trim()
  const displayName = prog.trading_name || coachName
  const isUnder18 = prog.target_audience === 'under_18s' || prog.target_audience === 'both'
  const days = Array.isArray(prog.session_days) ? prog.session_days.join(', ') : prog.session_days || ''
  const methods = Array.isArray(prog.payment_methods) ? prog.payment_methods.join(', ') : ''

  // ─── Success State ───
  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#3D8B37]/10 flex items-center justify-center">
            {success.status === 'waitlisted' ? (
              <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-[#3D8B37]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            {success.status === 'waitlisted' ? 'Added to Waitlist' : "You're In!"}
          </h1>
          <p className="text-gray-600 leading-relaxed whitespace-pre-line">{success.message}</p>

          {prog.what_to_bring && success.status !== 'waitlisted' && (
            <div className="mt-6 bg-[#3D8B37]/5 rounded-xl p-4 text-left">
              <p className="text-sm font-semibold text-[#3D8B37] mb-1">What to bring</p>
              <p className="text-sm text-gray-600">{prog.what_to_bring}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── Main Form ───
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-[#3D8B37] text-white">
        <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-white/80">{displayName}</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">{prog.programme_name}</h1>
          {prog.short_description && (
            <p className="text-white/80 text-sm md:text-base">{prog.short_description}</p>
          )}

          {/* Quick info pills */}
          <div className="flex flex-wrap gap-2 mt-4">
            {days && (
              <span className="bg-white/20 text-white text-xs font-medium px-3 py-1.5 rounded-full">
                {days}
              </span>
            )}
            {prog.session_start_time && (
              <span className="bg-white/20 text-white text-xs font-medium px-3 py-1.5 rounded-full">
                {prog.session_start_time}
              </span>
            )}
            {prog.session_duration && (
              <span className="bg-white/20 text-white text-xs font-medium px-3 py-1.5 rounded-full">
                {prog.session_duration}
              </span>
            )}
            {prog.specific_age_group && (
              <span className="bg-white/20 text-white text-xs font-medium px-3 py-1.5 rounded-full">
                Ages: {prog.specific_age_group}
              </span>
            )}
            {prog.price_gbp && (
              <span className="bg-white/20 text-white text-xs font-medium px-3 py-1.5 rounded-full">
                {prog.price_gbp ? `£${prog.price_gbp}` : 'Free'}{prog.payment_model ? ` / ${prog.payment_model}` : ''}
              </span>
            )}
          </div>

          {/* Availability badge */}
          <div className="mt-4">
            {prog.isFull ? (
              prog.waitlist_enabled ? (
                <span className="inline-flex items-center gap-1.5 bg-amber-500/20 text-amber-100 text-sm font-medium px-3 py-1.5 rounded-full">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Full — join the waitlist ({prog.waitlistCount} waiting)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 bg-red-500/20 text-red-100 text-sm font-medium px-3 py-1.5 rounded-full">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  Currently full
                </span>
              )
            ) : prog.spotsLeft !== null ? (
              <span className="inline-flex items-center gap-1.5 bg-white/20 text-white text-sm font-medium px-3 py-1.5 rounded-full">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                {prog.spotsLeft} spot{prog.spotsLeft !== 1 ? 's' : ''} available
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 bg-white/20 text-white text-sm font-medium px-3 py-1.5 rounded-full">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Spaces available
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
        <div className="grid gap-6 md:grid-cols-5">

          {/* Left: Programme Details */}
          <div className="md:col-span-2 flex flex-col gap-4">
            {/* Schedule */}
            {(days || prog.session_start_time) && (
              <InfoCard
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                title="Schedule"
              >
                {days && <p>{days}</p>}
                {prog.session_start_time && <p>{prog.session_start_time}{prog.session_duration ? ` (${prog.session_duration})` : ''}</p>}
                {prog.session_frequency && <p className="text-gray-400">{prog.session_frequency}</p>}
                {prog.holiday_schedule && <p className="text-gray-400">Holidays: {prog.holiday_schedule}</p>}
              </InfoCard>
            )}

            {/* Venue */}
            {(prog.venue_name || prog.venue_address) && (
              <InfoCard
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                title="Location"
              >
                {prog.venue_name && <p className="font-medium">{prog.venue_name}</p>}
                {prog.venue_address && <p>{prog.venue_address}</p>}
                {prog.indoor_outdoor && <p className="text-gray-400">{prog.indoor_outdoor}</p>}
                {prog.parking && <p className="text-gray-400">Parking: {prog.parking}</p>}
                {prog.nearest_transport && <p className="text-gray-400">Transport: {prog.nearest_transport}</p>}
              </InfoCard>
            )}

            {/* Pricing */}
            {(prog.price_gbp || prog.paid_or_free === 'free') && (
              <InfoCard
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                title="Pricing"
              >
                {prog.paid_or_free === 'free' ? (
                  <p className="font-medium text-[#3D8B37]">Free</p>
                ) : (
                  <>
                    {prog.price_gbp && <p className="font-medium text-lg">{`£${prog.price_gbp}`}{prog.payment_model ? <span className="text-sm font-normal text-gray-500"> / {prog.payment_model}</span> : ''}</p>}
                    {prog.price_includes && <p className="text-gray-400">Includes: {prog.price_includes}</p>}
                    {prog.sibling_discount && <p className="text-gray-400">Sibling discount: {prog.sibling_discount}</p>}
                    {methods && <p className="text-gray-400">Pay by: {methods}</p>}
                  </>
                )}
              </InfoCard>
            )}

            {/* What to bring */}
            {(prog.what_to_bring || prog.kit_required) && (
              <InfoCard
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" /></svg>}
                title="What to Bring"
              >
                {prog.what_to_bring && <p>{prog.what_to_bring}</p>}
                {prog.kit_required === 'yes' && prog.kit_details && <p className="text-gray-400">Kit: {prog.kit_details}</p>}
                {prog.equipment_provided && <p className="text-gray-400">Equipment provided: {prog.equipment_provided}</p>}
              </InfoCard>
            )}

            {/* Coach info */}
            <InfoCard
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
              title="Your Coach"
            >
              <p className="font-medium">{coachName}</p>
              {prog.sport && <p>{prog.sport}{prog.coaching_level ? ` — ${prog.coaching_level}` : ''}</p>}
              {prog.dbs_status && <p className="text-gray-400">DBS: {prog.dbs_status}</p>}
              {prog.first_aid && <p className="text-gray-400">First Aid: {prog.first_aid}</p>}
            </InfoCard>

            {/* Trial info */}
            {prog.trial_available && prog.trial_available !== 'no' && (
              <div className="bg-[#3D8B37]/5 border border-[#3D8B37]/20 rounded-xl p-4">
                <p className="text-sm font-semibold text-[#3D8B37] mb-1">Trial Available</p>
                <p className="text-sm text-gray-600">{prog.trial_instructions || 'Try a session before committing.'}</p>
              </div>
            )}
          </div>

          {/* Right: Signup Form */}
          <div className="md:col-span-3">
            {prog.isFull && !prog.waitlist_enabled ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
                <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
                  <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900 mb-1">Programme Full</h2>
                <p className="text-gray-500 text-sm">
                  {prog.programme_name} is currently at capacity. Please contact {coachName} directly for more information.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-1">
                  {prog.isFull ? 'Join the Waitlist' : 'Sign Up'}
                </h2>
                <p className="text-gray-500 text-sm mb-5">
                  {prog.isFull
                    ? `${prog.programme_name} is currently full, but you can join the waitlist and we'll let you know when a space opens up.`
                    : `Fill in your details to join ${prog.programme_name}.`}
                </p>

                {submitError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
                    {submitError}
                  </div>
                )}

                {/* Parent/Guardian Details */}
                <fieldset className="mb-5">
                  <legend className="text-sm font-semibold text-gray-700 mb-3">Your Details</legend>
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Full Name *</label>
                      <input
                        type="text"
                        required
                        value={parentName}
                        onChange={(e) => setParentName(e.target.value)}
                        placeholder="Your full name"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D8B37]/40 focus:border-[#3D8B37]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                      <input
                        type="email"
                        value={parentEmail}
                        onChange={(e) => setParentEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D8B37]/40 focus:border-[#3D8B37]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Phone Number</label>
                      <input
                        type="tel"
                        value={parentPhone}
                        onChange={(e) => setParentPhone(e.target.value)}
                        placeholder="07xxx xxxxxx"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D8B37]/40 focus:border-[#3D8B37]"
                      />
                    </div>
                  </div>
                </fieldset>

                {/* Child Details (for under 18s) */}
                {isUnder18 && (
                  <fieldset className="mb-5">
                    <legend className="text-sm font-semibold text-gray-700 mb-3">Child Details</legend>
                    <div className="flex flex-col gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Child&apos;s Name</label>
                        <input
                          type="text"
                          value={childName}
                          onChange={(e) => setChildName(e.target.value)}
                          placeholder="Child's full name"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D8B37]/40 focus:border-[#3D8B37]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Date of Birth</label>
                        <input
                          type="date"
                          value={childDob}
                          onChange={(e) => setChildDob(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D8B37]/40 focus:border-[#3D8B37]"
                        />
                      </div>
                    </div>
                  </fieldset>
                )}

                {/* Medical / Additional Info */}
                <fieldset className="mb-5">
                  <legend className="text-sm font-semibold text-gray-700 mb-3">Additional Information</legend>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Medical conditions or allergies we should know about
                    </label>
                    <textarea
                      value={medicalNotes}
                      onChange={(e) => setMedicalNotes(e.target.value)}
                      rows={3}
                      placeholder="e.g. Asthma (carries inhaler), nut allergy..."
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D8B37]/40 focus:border-[#3D8B37] resize-y"
                    />
                    <p className="text-xs text-gray-400 mt-1">This information is shared confidentially with {coachName} only.</p>
                  </div>
                </fieldset>

                {/* Agreement */}
                <label className="flex items-start gap-3 mb-6 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#3D8B37] focus:ring-[#3D8B37]"
                  />
                  <span className="text-xs text-gray-500 leading-relaxed">
                    I confirm the above details are correct and consent to {displayName} storing this information for the purposes of managing
                    {isUnder18 ? " my child's" : ' my'} participation in {prog.programme_name}.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={submitting || !agreed || !parentName.trim()}
                  className="w-full bg-[#3D8B37] text-white py-3 rounded-xl font-semibold hover:bg-[#346E30] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {submitting
                    ? 'Submitting...'
                    : prog.isFull
                      ? 'Join Waitlist'
                      : prog.trial_available && prog.trial_available !== 'no'
                        ? 'Sign Up for Trial'
                        : 'Sign Up'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 pb-6">
          <p className="text-xs text-gray-400">
            Powered by <span className="font-medium text-gray-500">MyCoachingAssistant</span>
          </p>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Info Card                                                          */
/* ------------------------------------------------------------------ */

function InfoCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[#3D8B37]">{icon}</span>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="text-sm text-gray-600 flex flex-col gap-0.5">{children}</div>
    </div>
  )
}
