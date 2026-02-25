import type { Metadata } from 'next'
import './globals.css'
import Sidebar from './components/Sidebar'

export const metadata: Metadata = {
  title: 'InvoicePro',
  description: 'Professional invoice management',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        <Sidebar />
        <main className="md:ml-56 min-h-screen">
          {/* Mobile top padding for fixed header */}
          <div className="pt-16 md:pt-0">
            {children}
          </div>
        </main>
      </body>
    </html>
  )
}
