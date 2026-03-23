import { sql } from '@/lib/db'

export const BADGE_LEVELS = [
  { name: 'newcomer',  minScore: 0   },
  { name: 'explorer',  minScore: 20  },
  { name: 'guide',     minScore: 100 },
  { name: 'navigator', minScore: 200 },
  { name: 'pioneer',   minScore: 500 },
]

export async function updateBadge(userId: string) {
  const [user] = await sql`SELECT total_likes, points FROM users WHERE id = ${userId}`
  if (!user) return
  const score = (user.total_likes ?? 0) * 2 + (user.points ?? 0)
  let badge = 'newcomer'
  for (const level of BADGE_LEVELS) {
    if (score >= level.minScore) badge = level.name
  }
  await sql`UPDATE users SET badge = ${badge} WHERE id = ${userId}`
}

export async function addPoints(userId: string, pts: number) {
  await sql`UPDATE users SET points = points + ${pts} WHERE id = ${userId}`
  await updateBadge(userId)
}
