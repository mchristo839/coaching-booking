'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BRAND_GREEN = '#3D8B37'

const SPORTS = [
  'Football', 'Rugby Union', 'Rugby League', 'Cricket', 'Tennis', 'Netball',
  'Hockey', 'Basketball', 'Yoga', 'Fitness/Gym', 'Boxing', 'Martial Arts',
  'Swimming', 'Athletics', 'Dance', 'Gymnastics', 'Chess', 'Other',
]

const QUALIFICATION_LEVELS = [
  'Level 1', 'Level 2', 'Level 3', 'Level 4+', 'No formal qualification',
]

const AGE_GROUPS_OPTIONS = ['Under 18s', 'Over 18s', 'Both']

const DBS_OPTIONS = [
  'Valid -- Enhanced', 'Valid -- Standard', 'In progress', 'Not yet obtained',
]

const FIRST_AID_OPTIONS = [
  'Paediatric -- Valid', 'Emergency -- Valid', 'Full -- Valid', 'Expired', 'None',
]

const HEAR_ABOUT_OPTIONS = [
  'Google search', 'Social media', 'Word of mouth', 'Email', 'Event', 'Other',
]

const PROGRAMME_AUDIENCE = ['Under 18s only', 'Over 18s only', 'Both']

const U18_AGE_GROUPS = [
  'Under 5s', 'Under 6s', 'Under 7s', 'Under 8s', 'Under 9s', 'Under 10s',
  'Under 11s', 'Under 12s', 'Under 13s', 'Under 14s', 'Under 15s',
  'Under 16s', 'Under 17s', 'Mixed juniors',
]

const RUN_TYPES = ['Ongoing', 'Term-based', 'Fixed period', 'Seasonal', 'Block']

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const DURATION_OPTIONS = [
  '30 mins', '45 mins', '1 hour', '1.5 hours', '2 hours', '2+ hours',
]

const FREQUENCY_OPTIONS = [
  'Once a week', 'Twice a week', 'Three times a week', 'Fortnightly',
  'Monthly', 'Variable',
]

const PARKING_OPTIONS = ['Free on-site', 'Paid on-site', 'Street parking', 'None nearby']

const INDOOR_OUTDOOR = ['Indoor', 'Outdoor', 'Both']

const SKILL_LEVELS = [
  'Beginner', 'Intermediate', 'Advanced', 'All levels', 'Mixed ability',
]

const PROGRAMME_STATUS_OPTIONS = [
  'Open for registration', 'Waitlist only', 'Full', 'Coming soon', 'Closed',
]

const TRIAL_OPTIONS = ['Yes -- free', 'Yes -- discounted', 'No']

const EQUIPMENT_OPTIONS = ['All provided', 'Some provided', 'Bring your own']

const KIT_OPTIONS = ['Required', 'Optional', 'Not required']

const PAID_FREE = ['Paid', 'Free']

const PAYMENT_MODEL_OPTIONS = [
  'Per session', 'Monthly', 'Termly', 'Block booking', 'Annual', 'Other',
]

const PAYMENT_METHODS = ['Stripe', 'Cash', 'Bank transfer']

// ---------------------------------------------------------------------------
// Stage labels
// ---------------------------------------------------------------------------

const STAGE_LABELS = [
  'Business Type',
  'Your Details',
  'Verify Email',
  'Coach Details',
  'Programme',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cls(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ')
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProgressBar({ stage }: { stage: number }) {
  return (
    <div className="w-full mb-8">
      <div className="flex items-center justify-between mb-2">
        {STAGE_LABELS.map((label, i) => {
          const step = i + 1
          const done = stage > step
          const active = stage === step
          return (
            <div key={label} className="flex flex-col items-center flex-1">
              <div
                className={cls(
                  'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors',
                  done && 'bg-[#3D8B37] text-white',
                  active && 'bg-[#3D8B37] text-white ring-4 ring-green-200',
                  !done && !active && 'bg-gray-200 text-gray-500',
                )}
              >
                {done ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                ) : (
                  step
                )}
              </div>
              <span className="text-[11px] mt-1 text-gray-500 hidden sm:block">{label}</span>
            </div>
          )
        })}
      </div>
      {/* bar */}
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${((stage - 1) / (STAGE_LABELS.length - 1)) * 100}%`, backgroundColor: BRAND_GREEN }}
        />
      </div>
    </div>
  )
}

function Label({ children, htmlFor, required }: { children: React.ReactNode; htmlFor?: string; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cls(
        'w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 text-sm',
        'focus:ring-2 focus:ring-[#3D8B37]/40 focus:border-[#3D8B37] outline-none transition',
        props.className,
      )}
    />
  )
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select
      {...props}
      className={cls(
        'w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 text-sm bg-white',
        'focus:ring-2 focus:ring-[#3D8B37]/40 focus:border-[#3D8B37] outline-none transition',
        props.className,
      )}
    >
      {children}
    </select>
  )
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cls(
        'w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 text-sm',
        'focus:ring-2 focus:ring-[#3D8B37]/40 focus:border-[#3D8B37] outline-none transition',
        props.className,
      )}
    />
  )
}

function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cls(
        'px-6 py-3 rounded-lg font-medium text-white text-sm transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]',
        props.className,
      )}
      style={{ backgroundColor: BRAND_GREEN, ...(!props.disabled ? {} : {}) }}
    >
      {children}
    </button>
  )
}

function SecondaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cls(
        'px-6 py-3 rounded-lg font-medium text-gray-700 text-sm border border-gray-300 bg-white',
        'hover:bg-gray-50 transition-colors min-h-[44px]',
        props.className,
      )}
    >
      {children}
    </button>
  )
}

function ErrorBanner({ message }: { message: string }) {
  if (!message) return null
  return (
    <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
      {message}
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold text-gray-800 mt-6 mb-3 border-b pb-2">{children}</h3>
}

function MultiSelect({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const selected = value.includes(opt)
        return (
          <button
            key={opt}
            type="button"
            onClick={() =>
              onChange(selected ? value.filter((v) => v !== opt) : [...value, opt])
            }
            className={cls(
              'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
              selected
                ? 'border-[#3D8B37] bg-[#3D8B37]/10 text-[#3D8B37]'
                : 'border-gray-300 text-gray-600 hover:border-gray-400',
            )}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FAQ pair component
// ---------------------------------------------------------------------------

interface FAQ {
  question: string
  answer: string
}

function FAQEditor({ faqs, onChange }: { faqs: FAQ[]; onChange: (f: FAQ[]) => void }) {
  const add = () => onChange([...faqs, { question: '', answer: '' }])
  const remove = (i: number) => onChange(faqs.filter((_, idx) => idx !== i))
  const update = (i: number, field: 'question' | 'answer', val: string) => {
    const next = [...faqs]
    next[i] = { ...next[i], [field]: val }
    onChange(next)
  }

  return (
    <div className="space-y-4">
      {faqs.map((faq, i) => (
        <div key={i} className="border border-gray-200 rounded-lg p-4 relative">
          <button
            type="button"
            onClick={() => remove(i)}
            className="absolute top-2 right-2 text-gray-400 hover:text-red-500 text-lg leading-none"
            aria-label="Remove"
          >
            &times;
          </button>
          <div className="mb-3">
            <Label>Question</Label>
            <Input value={faq.question} onChange={(e) => update(i, 'question', e.target.value)} placeholder="e.g. What should I bring?" />
          </div>
          <div>
            <Label>Answer</Label>
            <Textarea rows={2} value={faq.answer} onChange={(e) => update(i, 'answer', e.target.value)} placeholder="The answer your bot will give" />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-sm font-medium text-[#3D8B37] hover:underline"
      >
        + Add another Q&amp;A
      </button>
    </div>
  )
}

// ===========================================================================
// Main Page Component
// ===========================================================================

export default function RegisterPage() {
  const router = useRouter()

  // ---- global state
  const [stage, setStage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // ---- Stage 1: business type
  const [businessType, setBusinessType] = useState('')

  // ---- Stage 2: your details
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [tradingName, setTradingName] = useState('')
  const [town, setTown] = useState('')
  const [postcode, setPostcode] = useState('')
  const [hearAbout, setHearAbout] = useState('')
  const [password, setPassword] = useState('')

  // ---- Stage 3: verify (uses email + providerId)
  const [providerId, setProviderId] = useState('')

  // ---- Stage 4: coach
  const [isAlsoCoach, setIsAlsoCoach] = useState(false)
  const [coachFirst, setCoachFirst] = useState('')
  const [coachLast, setCoachLast] = useState('')
  const [coachEmail, setCoachEmail] = useState('')
  const [coachMobile, setCoachMobile] = useState('')
  const [sport, setSport] = useState('')
  const [qualification, setQualification] = useState('')
  const [ageGroups, setAgeGroups] = useState<string[]>([])
  const [dbsStatus, setDbsStatus] = useState('')
  const [firstAid, setFirstAid] = useState('')
  const [insurance, setInsurance] = useState('')
  const [coachId, setCoachId] = useState('')

  // ---- Stage 5: programme
  const [progAudience, setProgAudience] = useState('')
  const [progAgeGroup, setProgAgeGroup] = useState('')
  const [progName, setProgName] = useState('')
  const [progDescription, setProgDescription] = useState('')

  const [runType, setRunType] = useState('')
  const [sessionDays, setSessionDays] = useState<string[]>([])
  const [sessionTime, setSessionTime] = useState('')
  const [sessionDuration, setSessionDuration] = useState('')
  const [sessionFrequency, setSessionFrequency] = useState('')
  const [holidaySchedule, setHolidaySchedule] = useState('')
  const [cancellationNotice, setCancellationNotice] = useState('')

  const [venueName, setVenueName] = useState('')
  const [venueAddress, setVenueAddress] = useState('')
  const [parking, setParking] = useState('')
  const [publicTransport, setPublicTransport] = useState('')
  const [indoorOutdoor, setIndoorOutdoor] = useState('')
  const [badWeather, setBadWeather] = useState('')

  const [skillLevel, setSkillLevel] = useState('')
  const [maxCapacity, setMaxCapacity] = useState('')
  const [progStatus, setProgStatus] = useState('')
  const [trialSession, setTrialSession] = useState('')
  const [waitlist, setWaitlist] = useState('')

  const [whatToBring, setWhatToBring] = useState('')
  const [equipmentProvided, setEquipmentProvided] = useState('')
  const [kitRequirement, setKitRequirement] = useState('')

  const [paidFree, setPaidFree] = useState('')
  const [paymentModel, setPaymentModel] = useState('')
  const [price, setPrice] = useState('')
  const [priceIncludes, setPriceIncludes] = useState('')
  const [siblingDiscount, setSiblingDiscount] = useState('')
  const [refundPolicy, setRefundPolicy] = useState('')
  const [paymentMethods, setPaymentMethods] = useState<string[]>([])

  const [faqs, setFaqs] = useState<FAQ[]>([{ question: '', answer: '' }])
  const [botNotes, setBotNotes] = useState('')

  // ---- pre-fill coach from Stage 2
  useEffect(() => {
    if (isAlsoCoach) {
      setCoachFirst(firstName)
      setCoachLast(lastName)
      setCoachEmail(email)
      setCoachMobile(mobile)
    }
  }, [isAlsoCoach, firstName, lastName, email, mobile])

  // ---- persist IDs
  useEffect(() => {
    const stored = localStorage.getItem('providerId')
    if (stored) setProviderId(stored)
    const storedCoach = localStorage.getItem('coachId')
    if (storedCoach) setCoachId(storedCoach)
  }, [])

  // ---- navigation helpers
  function back() {
    setError('')
    setStage((s) => Math.max(1, s - 1))
    window.scrollTo(0, 0)
  }

  function advance() {
    setError('')
    setStage((s) => s + 1)
    window.scrollTo(0, 0)
  }

  // ---- email validation
  function isValidEmail(e: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
  }

  // =========================================================================
  // Stage 2 submit
  // =========================================================================
  async function submitDetails(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          mobile,
          tradingName: tradingName || `${firstName} ${lastName}`,
          town,
          postcode,
          hearAbout,
          password,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Registration failed.'); return }
      setProviderId(data.providerId)
      localStorage.setItem('providerId', data.providerId)
      advance()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // =========================================================================
  // Stage 3 verify
  // =========================================================================
  async function verifyEmail() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Verification failed.'); return }
      advance()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // =========================================================================
  // Stage 4 submit coach
  // =========================================================================
  async function submitCoach(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/coaches/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId,
          firstName: coachFirst,
          lastName: coachLast,
          email: coachEmail,
          mobile: coachMobile,
          sport,
          qualification,
          ageGroups,
          dbsStatus,
          firstAid,
          insurance,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to save coach.'); return }
      setCoachId(data.coachId)
      localStorage.setItem('coachId', data.coachId)
      advance()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // =========================================================================
  // Stage 5 submit programme
  // =========================================================================
  async function submitProgramme(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    // Fallback: read coachId from localStorage if state lost
    const activeCoachId = coachId || localStorage.getItem('coachId') || ''
    if (!activeCoachId) {
      setError('Coach ID not found. Please go back to Step 4 and save your coach details.')
      setLoading(false)
      return
    }
    const filteredFaqs = faqs.filter((f) => f.question.trim() && f.answer.trim())
    try {
      const res = await fetch('/api/programmes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachId: activeCoachId,
          audience: progAudience,
          specificAgeGroup: progAgeGroup,
          name: progName,
          description: progDescription,
          runType,
          sessionDays,
          sessionTime,
          sessionDuration,
          sessionFrequency,
          holidaySchedule,
          cancellationNotice,
          venueName,
          venueAddress,
          parking,
          publicTransport,
          indoorOutdoor,
          badWeather,
          skillLevel,
          maxCapacity: maxCapacity ? Number(maxCapacity) : null,
          status: progStatus,
          trialSession,
          waitlist,
          whatToBring,
          equipmentProvided,
          kitRequirement,
          paidFree,
          paymentModel,
          price: price ? Number(price) : null,
          priceIncludes,
          siblingDiscount,
          refundPolicy,
          paymentMethods,
          faqs: filteredFaqs,
          botNotes,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to save programme.'); return }
      setShowAnotherPrompt(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ---- "another programme?" prompt after Stage 5
  const [showAnotherPrompt, setShowAnotherPrompt] = useState(false)

  function resetProgrammeFields() {
    setProgAudience(''); setProgAgeGroup(''); setProgName(''); setProgDescription('')
    setRunType(''); setSessionDays([]); setSessionTime(''); setSessionDuration('')
    setSessionFrequency(''); setHolidaySchedule(''); setCancellationNotice('')
    setVenueName(''); setVenueAddress(''); setParking(''); setPublicTransport('')
    setIndoorOutdoor(''); setBadWeather('')
    setSkillLevel(''); setMaxCapacity(''); setProgStatus(''); setTrialSession(''); setWaitlist('')
    setWhatToBring(''); setEquipmentProvided(''); setKitRequirement('')
    setPaidFree(''); setPaymentModel(''); setPrice(''); setPriceIncludes('')
    setSiblingDiscount(''); setRefundPolicy(''); setPaymentMethods([])
    setFaqs([{ question: '', answer: '' }]); setBotNotes('')
    setShowAnotherPrompt(false)
    setError('')
    window.scrollTo(0, 0)
  }

  // =========================================================================
  // Render helpers per stage
  // =========================================================================

  // ---- STAGE 1 ----
  function renderStage1() {
    const cards: { label: string; enabled: boolean }[] = [
      { label: 'Solo Coach / Instructor', enabled: true },
      { label: 'Sports / Activity Provider', enabled: false },
      { label: 'Sports Club', enabled: false },
    ]
    return (
      <>
        <h2 className="text-xl font-bold text-gray-900 mb-1">What type of coaching do you run?</h2>
        <p className="text-sm text-gray-500 mb-6">Select the option that best describes you.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {cards.map((c) => (
            <button
              key={c.label}
              type="button"
              disabled={!c.enabled}
              onClick={() => {
                if (c.enabled) {
                  setBusinessType(c.label)
                  advance()
                }
              }}
              className={cls(
                'relative rounded-xl border-2 p-6 text-left transition-all',
                c.enabled
                  ? 'border-gray-200 hover:border-[#3D8B37] hover:shadow-md cursor-pointer'
                  : 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed',
              )}
            >
              <span className="text-sm font-semibold text-gray-900">{c.label}</span>
              {!c.enabled && (
                <span className="block text-xs text-gray-400 mt-1">Coming Soon</span>
              )}
            </button>
          ))}
        </div>
      </>
    )
  }

  // ---- STAGE 2 ----
  function renderStage2() {
    return (
      <form onSubmit={submitDetails} className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Your Details</h2>
        <p className="text-sm text-gray-500 mb-4">Tell us about you so we can set up your account.</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="firstName" required>First Name</Label>
            <Input id="firstName" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="lastName" required>Last Name</Label>
            <Input id="lastName" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>

        <div>
          <Label htmlFor="email" required>Email Address</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="mobile" required>Mobile / WhatsApp Number</Label>
          <Input id="mobile" type="tel" required value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+44 7..." />
        </div>

        <div>
          <Label htmlFor="tradingName">Trading / Business Name</Label>
          <Input id="tradingName" value={tradingName} onChange={(e) => setTradingName(e.target.value)} />
          <p className="text-xs text-gray-400 mt-1">If left blank, your full name is used.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="town" required>Town / City</Label>
            <Input id="town" required value={town} onChange={(e) => setTown(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="postcode" required>Postcode</Label>
            <Input id="postcode" required value={postcode} onChange={(e) => setPostcode(e.target.value)} />
          </div>
        </div>

        <div>
          <Label htmlFor="hearAbout">How did you hear about us?</Label>
          <Select id="hearAbout" value={hearAbout} onChange={(e) => setHearAbout(e.target.value)}>
            <option value="">-- Select --</option>
            {HEAR_ABOUT_OPTIONS.map((o) => <option key={o}>{o}</option>)}
          </Select>
        </div>

        <div>
          <Label htmlFor="password" required>Password</Label>
          <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" />
        </div>

        <ErrorBanner message={error} />

        <div className="flex justify-between pt-2">
          <SecondaryButton type="button" onClick={back}>Back</SecondaryButton>
          <PrimaryButton type="submit" disabled={loading}>
            {loading ? 'Creating account...' : 'Continue'}
          </PrimaryButton>
        </div>
      </form>
    )
  }

  // ---- STAGE 3 ----
  function renderStage3() {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#3D8B37]/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-[#3D8B37]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Check your inbox</h2>
        <p className="text-sm text-gray-500 mb-1">
          We sent a verification link to:
        </p>
        <p className="text-sm font-semibold text-gray-800 mb-6">{email}</p>

        <ErrorBanner message={error} />

        {/* MVP auto-verify */}
        <PrimaryButton onClick={verifyEmail} disabled={loading}>
          {loading ? 'Verifying...' : 'Continue (email verified)'}
        </PrimaryButton>

        <div className="flex justify-center mt-6">
          <SecondaryButton type="button" onClick={back}>Back</SecondaryButton>
        </div>
      </div>
    )
  }

  // ---- STAGE 4 ----
  function renderStage4() {
    const showDbs = ageGroups.includes('Under 18s') || ageGroups.includes('Both')
    return (
      <form onSubmit={submitCoach} className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Coach Details</h2>
        <p className="text-sm text-gray-500 mb-4">Tell us about the coach or instructor.</p>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isAlsoCoach}
            onChange={(e) => setIsAlsoCoach(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-[#3D8B37] focus:ring-[#3D8B37]"
          />
          <span className="text-sm text-gray-700">I am also the coach / instructor</span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="coachFirst" required>First Name</Label>
            <Input id="coachFirst" required value={coachFirst} onChange={(e) => setCoachFirst(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="coachLast" required>Last Name</Label>
            <Input id="coachLast" required value={coachLast} onChange={(e) => setCoachLast(e.target.value)} />
          </div>
        </div>

        <div>
          <Label htmlFor="coachEmail" required>Email</Label>
          <Input id="coachEmail" type="email" required value={coachEmail} onChange={(e) => setCoachEmail(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="coachMobile" required>Mobile</Label>
          <Input id="coachMobile" type="tel" required value={coachMobile} onChange={(e) => setCoachMobile(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="sport" required>Primary Sport / Activity</Label>
          <Select id="sport" required value={sport} onChange={(e) => setSport(e.target.value)}>
            <option value="">-- Select --</option>
            {SPORTS.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </div>

        <div>
          <Label htmlFor="qualification">Coaching Qualification Level</Label>
          <Select id="qualification" value={qualification} onChange={(e) => setQualification(e.target.value)}>
            <option value="">-- Select --</option>
            {QUALIFICATION_LEVELS.map((q) => <option key={q}>{q}</option>)}
          </Select>
        </div>

        <div>
          <Label required>Age Groups You Coach</Label>
          <MultiSelect options={AGE_GROUPS_OPTIONS} value={ageGroups} onChange={setAgeGroups} />
        </div>

        {showDbs && (
          <div>
            <Label htmlFor="dbsStatus" required>DBS Check Status</Label>
            <Select id="dbsStatus" required value={dbsStatus} onChange={(e) => setDbsStatus(e.target.value)}>
              <option value="">-- Select --</option>
              {DBS_OPTIONS.map((d) => <option key={d}>{d}</option>)}
            </Select>
          </div>
        )}

        <div>
          <Label htmlFor="firstAid">First Aid Certification</Label>
          <Select id="firstAid" value={firstAid} onChange={(e) => setFirstAid(e.target.value)}>
            <option value="">-- Select --</option>
            {FIRST_AID_OPTIONS.map((f) => <option key={f}>{f}</option>)}
          </Select>
        </div>

        <div>
          <Label htmlFor="insurance">Public Liability Insurance</Label>
          <Select id="insurance" value={insurance} onChange={(e) => setInsurance(e.target.value)}>
            <option value="">-- Select --</option>
            <option>Yes -- in place</option>
            <option>No</option>
          </Select>
        </div>

        <ErrorBanner message={error} />

        <div className="flex justify-between pt-2">
          <SecondaryButton type="button" onClick={back}>Back</SecondaryButton>
          <PrimaryButton type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Continue'}
          </PrimaryButton>
        </div>
      </form>
    )
  }

  // ---- STAGE 5 ----
  function renderStage5() {
    if (showAnotherPrompt) {
      return (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#3D8B37]/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-[#3D8B37]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Programme saved!</h2>
          <p className="text-sm text-gray-500 mb-8">Do you run another programme?</p>
          <div className="flex justify-center gap-4">
            <PrimaryButton onClick={resetProgrammeFields}>
              Yes, add another
            </PrimaryButton>
            <SecondaryButton onClick={() => router.push('/dashboard')}>
              No, go to dashboard
            </SecondaryButton>
          </div>
        </div>
      )
    }

    const showU18AgeGroup = progAudience === 'Under 18s only' || progAudience === 'Both'
    const showBadWeather = indoorOutdoor === 'Outdoor' || indoorOutdoor === 'Both'
    const showPaymentDetails = paidFree === 'Paid'

    return (
      <form onSubmit={submitProgramme} className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Programme Details</h2>
        <p className="text-sm text-gray-500 mb-2">This information powers your WhatsApp coaching bot.</p>

        {/* 5A */}
        <SectionHeading>Age Group &amp; Programme Info</SectionHeading>

        <div>
          <Label htmlFor="progAudience" required>Who is this programme for?</Label>
          <Select id="progAudience" required value={progAudience} onChange={(e) => setProgAudience(e.target.value)}>
            <option value="">-- Select --</option>
            {PROGRAMME_AUDIENCE.map((a) => <option key={a}>{a}</option>)}
          </Select>
        </div>

        {showU18AgeGroup && (
          <div>
            <Label htmlFor="progAgeGroup">Specific Age Group</Label>
            <Select id="progAgeGroup" value={progAgeGroup} onChange={(e) => setProgAgeGroup(e.target.value)}>
              <option value="">-- Select --</option>
              {U18_AGE_GROUPS.map((a) => <option key={a}>{a}</option>)}
            </Select>
          </div>
        )}

        <div>
          <Label htmlFor="progName" required>Group / Programme Name</Label>
          <Input id="progName" required value={progName} onChange={(e) => setProgName(e.target.value)} placeholder="e.g. Saturday Morning Football" />
        </div>

        <div>
          <Label htmlFor="progDescription" required>Short Description</Label>
          <Textarea id="progDescription" required rows={3} value={progDescription} onChange={(e) => setProgDescription(e.target.value)} placeholder="2-3 sentences about this programme" />
        </div>

        {/* 5B */}
        <SectionHeading>Schedule</SectionHeading>

        <div>
          <Label htmlFor="runType" required>How does this programme run?</Label>
          <Select id="runType" required value={runType} onChange={(e) => setRunType(e.target.value)}>
            <option value="">-- Select --</option>
            {RUN_TYPES.map((r) => <option key={r}>{r}</option>)}
          </Select>
        </div>

        <div>
          <Label required>Session Day(s)</Label>
          <MultiSelect options={DAYS} value={sessionDays} onChange={setSessionDays} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="sessionTime" required>Session Start Time</Label>
            <Input id="sessionTime" type="time" required value={sessionTime} onChange={(e) => setSessionTime(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sessionDuration" required>Session Duration</Label>
            <Select id="sessionDuration" required value={sessionDuration} onChange={(e) => setSessionDuration(e.target.value)}>
              <option value="">-- Select --</option>
              {DURATION_OPTIONS.map((d) => <option key={d}>{d}</option>)}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="sessionFrequency" required>Session Frequency</Label>
          <Select id="sessionFrequency" required value={sessionFrequency} onChange={(e) => setSessionFrequency(e.target.value)}>
            <option value="">-- Select --</option>
            {FREQUENCY_OPTIONS.map((f) => <option key={f}>{f}</option>)}
          </Select>
        </div>

        <div>
          <Label htmlFor="holidaySchedule">Holiday schedule</Label>
          <Input id="holidaySchedule" value={holidaySchedule} onChange={(e) => setHolidaySchedule(e.target.value)} placeholder="e.g. No sessions during school holidays" />
        </div>

        <div>
          <Label htmlFor="cancellationNotice">Cancellation notice period</Label>
          <Input id="cancellationNotice" value={cancellationNotice} onChange={(e) => setCancellationNotice(e.target.value)} placeholder="e.g. 24 hours" />
        </div>

        {/* 5C */}
        <SectionHeading>Venue</SectionHeading>

        <div>
          <Label htmlFor="venueName" required>Venue Name</Label>
          <Input id="venueName" required value={venueName} onChange={(e) => setVenueName(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="venueAddress" required>Full Address</Label>
          <Textarea id="venueAddress" required rows={2} value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="parking">Parking</Label>
            <Select id="parking" value={parking} onChange={(e) => setParking(e.target.value)}>
              <option value="">-- Select --</option>
              {PARKING_OPTIONS.map((p) => <option key={p}>{p}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="publicTransport">Nearest public transport</Label>
            <Input id="publicTransport" value={publicTransport} onChange={(e) => setPublicTransport(e.target.value)} placeholder="e.g. 5 min walk from X station" />
          </div>
        </div>

        <div>
          <Label htmlFor="indoorOutdoor" required>Indoor or outdoor?</Label>
          <Select id="indoorOutdoor" required value={indoorOutdoor} onChange={(e) => setIndoorOutdoor(e.target.value)}>
            <option value="">-- Select --</option>
            {INDOOR_OUTDOOR.map((i) => <option key={i}>{i}</option>)}
          </Select>
        </div>

        {showBadWeather && (
          <div>
            <Label htmlFor="badWeather">Bad weather policy</Label>
            <Input id="badWeather" value={badWeather} onChange={(e) => setBadWeather(e.target.value)} placeholder="e.g. Cancelled if heavy rain, notified by 8am" />
          </div>
        )}

        {/* 5D */}
        <SectionHeading>Capacity</SectionHeading>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="skillLevel" required>Skill level</Label>
            <Select id="skillLevel" required value={skillLevel} onChange={(e) => setSkillLevel(e.target.value)}>
              <option value="">-- Select --</option>
              {SKILL_LEVELS.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="maxCapacity">Max capacity</Label>
            <Input id="maxCapacity" type="number" min={1} value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="progStatus" required>Programme status</Label>
            <Select id="progStatus" required value={progStatus} onChange={(e) => setProgStatus(e.target.value)}>
              <option value="">-- Select --</option>
              {PROGRAMME_STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="trialSession">Trial session available?</Label>
            <Select id="trialSession" value={trialSession} onChange={(e) => setTrialSession(e.target.value)}>
              <option value="">-- Select --</option>
              {TRIAL_OPTIONS.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="waitlist">Waitlist enabled</Label>
          <Select id="waitlist" value={waitlist} onChange={(e) => setWaitlist(e.target.value)}>
            <option value="">-- Select --</option>
            <option>Yes</option>
            <option>No</option>
          </Select>
        </div>

        {/* 5E */}
        <SectionHeading>What to Bring</SectionHeading>

        <div>
          <Label htmlFor="whatToBring">What to bring</Label>
          <Textarea id="whatToBring" rows={2} value={whatToBring} onChange={(e) => setWhatToBring(e.target.value)} placeholder="e.g. Water bottle, shin pads, trainers" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="equipmentProvided">Equipment provided?</Label>
            <Select id="equipmentProvided" value={equipmentProvided} onChange={(e) => setEquipmentProvided(e.target.value)}>
              <option value="">-- Select --</option>
              {EQUIPMENT_OPTIONS.map((eq) => <option key={eq}>{eq}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="kitRequirement">Kit/uniform requirement?</Label>
            <Select id="kitRequirement" value={kitRequirement} onChange={(e) => setKitRequirement(e.target.value)}>
              <option value="">-- Select --</option>
              {KIT_OPTIONS.map((k) => <option key={k}>{k}</option>)}
            </Select>
          </div>
        </div>

        {/* 5F */}
        <SectionHeading>Cost &amp; Payment</SectionHeading>

        <div>
          <Label htmlFor="paidFree" required>Paid or free?</Label>
          <Select id="paidFree" required value={paidFree} onChange={(e) => setPaidFree(e.target.value)}>
            <option value="">-- Select --</option>
            {PAID_FREE.map((p) => <option key={p}>{p}</option>)}
          </Select>
        </div>

        {showPaymentDetails && (
          <>
            <div>
              <Label htmlFor="paymentModel" required>Payment model</Label>
              <Select id="paymentModel" required value={paymentModel} onChange={(e) => setPaymentModel(e.target.value)}>
                <option value="">-- Select --</option>
                {PAYMENT_MODEL_OPTIONS.map((p) => <option key={p}>{p}</option>)}
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="price" required>Price (GBP)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">£</span>
                  <Input id="price" type="number" min={0} step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)} className="pl-7" />
                </div>
              </div>
              <div>
                <Label htmlFor="priceIncludes">What does price include?</Label>
                <Input id="priceIncludes" value={priceIncludes} onChange={(e) => setPriceIncludes(e.target.value)} placeholder="e.g. Coaching, bibs, balls" />
              </div>
            </div>

            <div>
              <Label htmlFor="siblingDiscount">Sibling/family discount?</Label>
              <Input id="siblingDiscount" value={siblingDiscount} onChange={(e) => setSiblingDiscount(e.target.value)} placeholder="e.g. 10% off second child" />
            </div>

            <div>
              <Label htmlFor="refundPolicy">Refund policy</Label>
              <Input id="refundPolicy" value={refundPolicy} onChange={(e) => setRefundPolicy(e.target.value)} placeholder="e.g. Full refund if cancelled 48hrs before" />
            </div>

            <div>
              <Label>Payment methods</Label>
              <MultiSelect options={PAYMENT_METHODS} value={paymentMethods} onChange={setPaymentMethods} />
            </div>
          </>
        )}

        {/* 5G */}
        <SectionHeading>Custom Q&amp;A for Your Bot</SectionHeading>
        <p className="text-xs text-gray-500 -mt-2 mb-3">Add questions and answers your WhatsApp bot should know.</p>

        <FAQEditor faqs={faqs} onChange={setFaqs} />

        <div className="mt-4">
          <Label htmlFor="botNotes">Anything else the bot should know?</Label>
          <Textarea id="botNotes" rows={3} value={botNotes} onChange={(e) => setBotNotes(e.target.value)} placeholder="Any extra context or personality notes for the bot" />
        </div>

        <ErrorBanner message={error} />

        <div className="flex justify-between pt-4">
          <SecondaryButton type="button" onClick={back}>Back</SecondaryButton>
          <PrimaryButton type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Save Programme'}
          </PrimaryButton>
        </div>
      </form>
    )
  }

  // =========================================================================
  // Main render
  // =========================================================================

  const stageRenderers: Record<number, () => React.ReactNode> = {
    1: renderStage1,
    2: renderStage2,
    3: renderStage3,
    4: renderStage4,
    5: renderStage5,
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:py-12">
      <div className="max-w-2xl mx-auto">
        {/* Logo / title */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            <span style={{ color: BRAND_GREEN }}>My</span>CoachingAssistant
          </h1>
          <p className="text-sm text-gray-500 mt-1">Set up your AI coaching bot in minutes</p>
        </div>

        <ProgressBar stage={stage} />

        <div className="bg-white rounded-xl shadow-sm p-6 md:p-8">
          {stageRenderers[stage]?.()}
        </div>

        {/* Login link */}
        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <Link href="/auth/login" className="font-medium hover:underline" style={{ color: BRAND_GREEN }}>
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
