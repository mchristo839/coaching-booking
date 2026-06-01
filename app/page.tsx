'use client'

import Link from 'next/link'

const features = [
  {
    title: 'Answers every question',
    body: 'Parents get instant answers about times, prices, locations and more. 24/7, via WhatsApp.',
  },
  {
    title: 'Learns from you',
    body: 'The bot watches how you communicate, then matches your style. It gets smarter every week.',
  },
  {
    title: 'Gives you back your time',
    body: 'No more answering the same WhatsApp messages. No more chasing payments. No more admin.',
  },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Signature moment: soft animated green aurora + dotted grid. */}
        <div className="aurora-field" aria-hidden="true">
          <div className="aurora-blob aurora-blob--a" />
          <div className="aurora-blob aurora-blob--b" />
        </div>
        <div className="absolute inset-0 grid-texture opacity-60" aria-hidden="true" />

        <div className="relative mx-auto max-w-6xl px-6 pt-24 pb-20 md:pt-32 md:pb-28">
          <div className="grid items-center gap-12 md:grid-cols-[1.1fr_0.9fr]">
            {/* Left: headline + CTAs */}
            <div>
              <span className="eyebrow reveal reveal-1">For coaches &amp; instructors</span>
              <h1 className="reveal reveal-1 mt-4 font-display text-4xl font-extrabold leading-[1.08] tracking-[-0.02em] text-ink md:text-6xl">
                Your WhatsApp group,{' '}
                <span className="text-brand-600">run by an assistant</span> that never sleeps.
              </h1>
              <p className="reveal reveal-2 mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">
                MyCoachingAssistant handles enquiries, collects payments, and tracks
                attendance — so you can focus on coaching, not admin.
              </p>

              <div className="reveal reveal-3 mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/register" className="btn-primary text-base">
                  Get started
                </Link>
                <Link href="/auth/login" className="btn-secondary text-base">
                  Log in
                </Link>
              </div>

              <p className="reveal reveal-3 mt-6 text-sm text-ink-muted">
                Built for coaches and instructors across the UK
              </p>
            </div>

            {/* Right: a small "chat" visual that hints at the product. */}
            <div className="reveal reveal-4 relative">
              <div className="mx-auto max-w-sm rounded-xl border border-line bg-surface p-5 shadow-card">
                <div className="flex items-center gap-2 border-b border-line pb-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                    MC
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">Monday Football — U9s</p>
                    <p className="text-xs text-ink-muted">Assistant active</p>
                  </div>
                </div>
                <div className="space-y-3 pt-4">
                  <div className="max-w-[80%] rounded-xl rounded-tl-sm bg-surface-muted px-3 py-2 text-sm text-ink">
                    What time does training finish on Thursday?
                  </div>
                  <div className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-brand-600 px-3 py-2 text-sm text-white">
                    Thursday training runs 5–6pm at Riverside Park. Pickup is from the
                    main gate. 👍
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={f.title}
              className={`card reveal reveal-${i + 1} group transition-all duration-200 hover:-translate-y-1 hover:shadow-card-hover`}
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-100">
                <span className="text-lg font-bold">{i + 1}</span>
              </div>
              <h3 className="font-display text-lg font-semibold text-ink">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{f.body}</p>
            </div>
          ))}
        </div>

        {/* Closing CTA band */}
        <div className="mt-16 overflow-hidden rounded-xl border border-line bg-surface p-8 text-center shadow-card md:p-12">
          <h2 className="font-display text-2xl font-bold text-ink md:text-3xl">
            Ready to hand off the admin?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-ink-muted">
            Set up your assistant in minutes and give your evenings back.
          </p>
          <div className="mt-7 flex justify-center">
            <Link href="/register" className="btn-primary text-base">
              Get started free
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
