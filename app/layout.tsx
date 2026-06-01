import type { Metadata } from 'next'
import { Inter, Plus_Jakarta_Sans } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

// Body — Inter. Display/headings — Plus Jakarta Sans. See DESIGN.md.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'MyCoachingAssistant — AI-powered coaching assistant',
  description: 'Handles enquiries, collects payments, tracks attendance — so you can focus on coaching.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`}>
      <body className="min-h-screen bg-canvas">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
