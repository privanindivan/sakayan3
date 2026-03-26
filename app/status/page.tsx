import { notFound } from 'next/navigation'
import StatusClient from './StatusClient'

export default function StatusPage() {
  // Only accessible in local dev — hidden on Netlify/production
  if (process.env.NETLIFY || process.env.NODE_ENV === 'production') {
    notFound()
  }
  return <StatusClient />
}
