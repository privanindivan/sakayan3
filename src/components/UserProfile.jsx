import { useEffect, useState } from 'react'

const BADGE_ICONS = {
  newcomer:  '🌱',
  explorer:  '🧭',
  guide:     '🗺️',
  navigator: '⭐',
  pioneer:   '🏆',
}

const BADGE_LABELS = {
  newcomer:  'Newcomer',
  explorer:  'Explorer',
  guide:     'Guide',
  navigator: 'Navigator',
  pioneer:   'Pioneer',
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function UserProfile({ userId, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [userId])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <button className="modal-close" onClick={onClose} aria-label="Close">&#x2715;</button>
        </div>
        <div className="modal-scroll">
        {loading && <div className="modal-body"><p style={{ color: '#aaa' }}>Loading…</p></div>}

        {!loading && data?.user && (
          <div className="modal-body profile-body">
            <div className="profile-header">
              {data.user.avatar_url
                ? <img src={data.user.avatar_url} className="profile-avatar" alt="avatar" />
                : <div className="profile-avatar-placeholder">{data.user.username?.[0]?.toUpperCase()}</div>
              }
              <div>
                <h2 style={{ margin: 0 }}>{data.user.username}</h2>
                <span className="profile-badge">
                  {BADGE_ICONS[data.user.badge] || '🌱'} {BADGE_LABELS[data.user.badge] || data.user.badge}
                </span>
              </div>
            </div>

            <div className="profile-stats">
              <div className="profile-stat">
                <span className="profile-stat-num">{data.stops?.length ?? 0}</span>
                <span className="profile-stat-label">Stops added</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-num">{data.connectionsCount ?? 0}</span>
                <span className="profile-stat-label">Routes added</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-num">{data.totalLikes ?? 0}</span>
                <span className="profile-stat-label">Likes received</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-num">{data.edits?.length ?? 0}</span>
                <span className="profile-stat-label">Edits made</span>
              </div>
            </div>

            {data.stops?.length > 0 && (
              <div className="profile-section">
                <h3 className="profile-section-title">Stops added</h3>
                <div className="profile-stops-list">
                  {data.stops.slice(0, 10).map(s => (
                    <div key={s.id} className="profile-stop-item">
                      <span>{s.name}</span>
                      <span className="comment-time">{timeAgo(s.created_at)}</span>
                    </div>
                  ))}
                  {data.stops.length > 10 && (
                    <p className="connect-empty">+{data.stops.length - 10} more</p>
                  )}
                </div>
              </div>
            )}

            {data.edits?.length > 0 && (
              <div className="profile-section">
                <h3 className="profile-section-title">Recent edits</h3>
                <div className="profile-stops-list">
                  {data.edits.slice(0, 8).map(e => (
                    <div key={e.id} className="profile-stop-item">
                      <span>
                        <span className={`history-action history-action-${e.action}`}>{e.action}</span>
                        {' '}{e.terminal_name || '(deleted stop)'}
                      </span>
                      <span className="comment-time">{timeAgo(e.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p style={{ fontSize: 11, color: '#666', marginTop: 12 }}>
              Member since {new Date(data.user.created_at).toLocaleDateString()}
            </p>
          </div>
        )}

        {!loading && !data?.user && (
          <div className="modal-body"><p style={{ color: '#aaa' }}>User not found.</p></div>
        )}
        </div>
      </div>
    </div>
  )
}
