import { useState, useEffect } from 'react'

const DIFFICULTY_COLOR = { easy: '#27AE60', medium: '#F39C12', hard: '#E74C3C' }
const DIFFICULTY_EMOJI = { easy: '🟢', medium: '🟡', hard: '🔴' }

export default function ChallengesPanel({ user, connections, markers, onClose, onLoginRequired }) {
  const [challenges, setChallenges]     = useState([])
  const [loading,    setLoading]        = useState(true)
  const [showCreate, setShowCreate]     = useState(false)
  const [title,      setTitle]          = useState('')
  const [desc,       setDesc]           = useState('')
  const [difficulty, setDifficulty]     = useState('easy')
  const [saving,     setSaving]         = useState(false)
  const [completedIds, setCompletedIds] = useState(new Set())

  useEffect(() => {
    fetch('/api/challenges')
      .then(r => r.json())
      .then(d => { setChallenges(d.challenges || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!user) { onLoginRequired(); return }
    setSaving(true)
    try {
      const res = await fetch('/api/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: desc, difficulty }),
      })
      if (res.ok) {
        const data = await res.json()
        setChallenges(prev => [data.challenge, ...prev])
        setTitle(''); setDesc(''); setShowCreate(false)
      }
    } finally { setSaving(false) }
  }

  const handleComplete = async (challengeId) => {
    if (!user) { onLoginRequired(); return }
    const res = await fetch(`/api/challenges/${challengeId}/complete`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setCompletedIds(prev => new Set([...prev, challengeId]))
      alert(`🎉 Challenge completed! You earned ${data.points_earned} points!`)
    } else {
      const data = await res.json()
      if (data.error === 'Already completed') alert('You already completed this challenge!')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal challenges-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>🏆 Challenges</h2>
        <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
          Complete route challenges to earn points and badges!
        </p>

        {user && (
          <button
            className="btn-primary"
            style={{ marginBottom: 16, width: '100%' }}
            onClick={() => setShowCreate(s => !s)}
          >
            {showCreate ? '✕ Cancel' : '+ Create Challenge'}
          </button>
        )}

        {!user && (
          <div className="auth-anon-note" style={{ marginBottom: 16 }}>
            <button className="auth-anon-btn" onClick={onLoginRequired}>Login</button>
            <span>to create challenges</span>
          </div>
        )}

        {showCreate && (
          <form onSubmit={handleCreate} style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              placeholder="Challenge title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}
            />
            <textarea
              placeholder="Description (optional)"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={2}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, resize: 'none' }}
            />
            <select
              value={difficulty}
              onChange={e => setDifficulty(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}
            >
              <option value="easy">🟢 Easy (10 pts)</option>
              <option value="medium">🟡 Medium (25 pts)</option>
              <option value="hard">🔴 Hard (50 pts)</option>
            </select>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Create Challenge'}
            </button>
          </form>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', color: '#888', padding: 24 }}>Loading…</div>
        ) : challenges.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#aaa', padding: 24 }}>
            No challenges yet. Be the first to create one!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '50vh', overflowY: 'auto' }}>
            {challenges.map(c => {
              const done = completedIds.has(c.id)
              return (
                <div key={c.id} style={{
                  background: done ? '#f0fdf4' : '#f8f9fa',
                  borderRadius: 12,
                  padding: '12px 14px',
                  border: `1px solid ${done ? '#bbf7d0' : '#eee'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{c.title}</span>
                      <span style={{ marginLeft: 6, fontSize: 11, color: DIFFICULTY_COLOR[c.difficulty], fontWeight: 600 }}>
                        {DIFFICULTY_EMOJI[c.difficulty]} {c.difficulty}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: '#888' }}>+{c.reward_points || 10}pts</span>
                  </div>
                  {c.description && (
                    <p style={{ fontSize: 12, color: '#666', margin: '4px 0', lineHeight: 1.4 }}>{c.description}</p>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: '#aaa' }}>by {c.creator_name || 'anonymous'}</span>
                    <button
                      style={{
                        padding: '4px 12px',
                        borderRadius: 20,
                        border: 'none',
                        background: done ? '#22C55E' : '#1a73e8',
                        color: 'white',
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                      onClick={() => done ? null : handleComplete(c.id)}
                      disabled={done}
                    >
                      {done ? '✓ Done' : 'Complete'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
