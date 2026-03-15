import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sakayan',
  description: 'Philippines Public Transport Route Mapper',
}

export const viewport: Viewport = {
  themeColor: '#1a73e8',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
