import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

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
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
