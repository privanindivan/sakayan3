import { useEffect, useState, useRef } from 'react'
import ImageCarousel from './ImageCarousel'
import { TYPE_COLORS, VEHICLE_TYPES } from '../data/sampleData'

const DAY_PRESETS = ['Daily', 'Weekdays (Mon–Fri)', 'Mon–Sat', 'Weekends', 'Custom']
const DAY_LABELS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const BADGE_ICONS = {
  newcomer:  '🌱',
  explorer:  '🧭',
  guide:     '🗺️',
  navigator: '⭐',
  pioneer:   '🏆',
}

function initSched(raw) {
  if (!raw || typeof raw === 'string') return { days: 'Daily', start: '', end: '', customDays: [] }
  return {
    days:       raw.days       || 'Daily',
    start:      raw.start      || '',
    end:        raw.end        || '',
    customDays: raw.customDays || [],
  }
}

function fmt12(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function formatSchedule(s) {
  if (!s) return ''
  if (typeof s === 'string') return s
  const { days, start, end, customDays } = s
  const dayStr  = days === 'Custom' && customDays?.length ? customDays.join(', ') : days
  const s12     = fmt12(start)
  const e12     = fmt12(end)
  const timeStr = s12 && e12 ? `${s12} – ${e12}` : s12 || e12 || ''
  return [dayStr, timeStr].filter(Boolean).join(' · ')
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

export default function MarkerModal({
  marker, connections, markers,
  user, isAdmin, requireAdmin,
  onClose, onSave, onDelete,
  onRemoveConnection, onUpdateConnection, onStartConnect, onConnClick,
  onAddWaypoint, onRemoveWaypoint, onVote,
  onOpenProfile,
  saving = false,
}) {
  const [editing,  setEditing]  = useState(false)
  const [copied,   setCopied]   = useState(false)
  const [tab,      setTab]      = useState('info') // 'info' | 'comments' | 'history'
  const [uploading, setUploading] = useState(false)
  const [editingConnId, setEditingConnId] = useState(null)
  const [connFareInput,  setConnFareInput]  = useState('')
  const [connMinInput,   setConnMinInput]   = useState('')
  const [name,     setName]     = useState(marker.name)
  const [type,     setType]     = useState(marker.type)
  const [details,  setDetails]  = useState(marker.details || '')
  const [sched,    setSched]    = useState(() => initSched(marker.schedule))
  const [images,   setImages]   = useState(marker.images)
  const fileInputRef = useRef(null)

  // Comments state
  const [comments,    setComments]    = useState([])
  const [commentText, setCommentText] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)

  // History state
  const [history,        setHistory]        = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [reverting,      setReverting]      = useState(null)
  const [confirmRevert,  setConfirmRevert]  = useState(null)
  const [savingConn,     setSavingConn]     = useState(false)
  const [deletingMarker, setDeletingMarker] = useState(false)
  const [submittingComment, setSubmittingComment] = useState(false)
  const [deletingComment,   setDeletingComment]   = useState(null)
  const [voting,         setVoting]         = useState(null)

  const stopConns = connections.filter(c => c.fromId === marker.id || c.toId === marker.id)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (tab === 'comments' && comments.length === 0) loadComments()
    if (tab === 'history'  && history.length === 0)  loadHistory()
  }, [tab])

  async function loadComments() {
    setLoadingComments(true)
    try {
      const r = await fetch(`/api/terminals/${marker.id}/comments`)
      const d = await r.json()
      setComments(d.comments || [])
    } finally { setLoadingComments(false) }
  }

  async function loadHistory() {
    setLoadingHistory(true)
    try {
      const r = await fetch(`/api/terminals/${marker.id}/history`)
      const d = await r.json()
      setHistory(d.history || [])
    } finally { setLoadingHistory(false) }
  }

  async function submitComment() {
    if (!commentText.trim()) return
    setSubmittingComment(true)
    const token = localStorage.getItem('sakayan_token')
    try {
      const r = await fetch(`/api/terminals/${marker.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ body: commentText.trim() }),
      })
      if (r.ok) {
        const d = await r.json()
        setComments(prev => [d.comment, ...prev])
        setCommentText('')
      }
    } finally { setSubmittingComment(false) }
  }

  async function deleteComment(commentId) {
    setDeletingComment(commentId)
    const token = localStorage.getItem('sakayan_token')
    try {
      await fetch(`/api/terminals/${marker.id}/comments?commentId=${commentId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      setComments(prev => prev.filter(c => c.id !== commentId))
    } finally { setDeletingComment(null) }
  }

  async function revertTo(logId) {
    setReverting(logId)
    try {
      const token = localStorage.getItem('sakayan_token')
      const r = await fetch(`/api/terminals/${marker.id}/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ logId }),
      })
      if (r.ok) {
        const d = await r.json()
        onSave({ ...marker, ...d.terminal })
        await loadHistory()
      }
    } finally { setReverting(null) }
  }

  const handleFilePick = async (e) => {
    const files = Array.from(e.target.files)
    e.target.value = ''
    if (!files.length) return
    setUploading(true)
    const token = localStorage.getItem('sakayan_token')
    for (const file of files) {
      const fd = new FormData()
      fd.append('file', file)
      try {
        const r = await fetch('/api/upload', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        })
        if (r.ok) {
          const d = await r.json()
          setImages(prev => [...prev, d.url])
        }
      } catch {}
    }
    setUploading(false)
  }

  const removeImage = (index) => setImages(prev => prev.filter((_, i) => i !== index))

  const toggleCustomDay = (day) => {
    setSched(s => ({
      ...s,
      customDays: s.customDays.includes(day)
        ? s.customDays.filter(d => d !== day)
        : [...s.customDays, day],
    }))
  }

  const handleSave = () => {
    if (!name.trim()) return
    const scheduleValue = (sched.start || sched.end || sched.days)
      ? { days: sched.days, start: sched.start, end: sched.end,
          ...(sched.days === 'Custom' ? { customDays: sched.customDays } : {}) }
      : null
    onSave({ ...marker, name: name.trim(), type, details: details.trim(), schedule: scheduleValue, images })
    setEditing(false)
  }

  const handleCancel = () => {
    setName(marker.name); setType(marker.type); setDetails(marker.details || '')
    setSched(initSched(marker.schedule)); setImages(marker.images); setEditing(false)
  }

  async function saveConnEdit(connId) {
    setSavingConn(true)
    const fare = connFareInput !== '' ? parseFloat(connFareInput) : null
    const duration_secs = connMinInput !== '' ? Math.round(parseFloat(connMinInput) * 60) : null
    const token = localStorage.getItem('sakayan_token')
    const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    const body = JSON.stringify({
      ...(fare != null ? { fare } : {}),
      ...(duration_secs != null ? { duration_secs } : {}),
    })
    try {
      const r = await fetch(`/api/connections/${connId}`, { method: 'PUT', headers, body })
      if (r.ok) {
        const d = await r.json()
        onUpdateConnection?.(d.connection)
      }
    } finally {
      setSavingConn(false)
      setEditingConnId(null)
    }
  }

  const badgeColor   = TYPE_COLORS[type] || '#1a73e8'
  const schedDisplay = formatSchedule(marker.schedule)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <button className="modal-close" onClick={onClose} aria-label="Close">&#x2715;</button>
        </div>
        <div className="modal-scroll">
        <ImageCarousel images={images} />

        <div className="modal-body">
          {editing ? (
            <>
              <label className="edit-label">Name</label>
              <input
                className="edit-field"
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
                placeholder="Stop or route name"
              />
              <label className="edit-label">Vehicle type</label>
              <select className="edit-field" value={type} onChange={e => setType(e.target.value)}>
                {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <label className="edit-label">Details</label>
              <textarea
                className="edit-field edit-textarea"
                value={details}
                onChange={e => setDetails(e.target.value)}
                placeholder="Routes, notes…"
                rows={3}
              />
              <label className="edit-label">Schedule</label>
              <select className="edit-field" value={sched.days} onChange={e => setSched(s => ({ ...s, days: e.target.value }))}>
                {DAY_PRESETS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              {sched.days === 'Custom' && (
                <div className="day-check-row">
                  {DAY_LABELS.map(day => (
                    <button key={day} type="button"
                      className={`day-check-btn${sched.customDays.includes(day) ? ' active' : ''}`}
                      onClick={() => toggleCustomDay(day)}>{day}</button>
                  ))}
                </div>
              )}
              <div className="time-range-row">
                <div className="time-field">
                  <span className="time-label">From</span>
                  <input type="time" className="edit-field time-input" value={sched.start}
                    onChange={e => setSched(s => ({ ...s, start: e.target.value }))} />
                </div>
                <div className="time-field">
                  <span className="time-label">To</span>
                  <input type="time" className="edit-field time-input" value={sched.end}
                    onChange={e => setSched(s => ({ ...s, end: e.target.value }))} />
                </div>
              </div>
              <label className="edit-label">Photos</label>
              <div className="photo-grid">
                {images.map((src, i) => (
                  <div key={i} className="photo-thumb">
                    <img src={src} alt={`photo ${i + 1}`} />
                    <button className="photo-remove" onClick={() => removeImage(i)} aria-label="Remove photo">&#x2715;</button>
                  </div>
                ))}
                <button className="photo-add" onClick={() => !uploading && fileInputRef.current?.click()} aria-label="Add photo" disabled={uploading}>
                  <span>{uploading ? '…' : '+'}</span><span className="photo-add-label">{uploading ? 'Uploading' : 'Add'}</span>
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFilePick} />
              <p className="coords-text" style={{ marginTop: 12 }}>{marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}</p>
              <div className="edit-actions">
                <button className="btn-save" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button className="btn-cancel-edit" onClick={handleCancel} disabled={saving}>Cancel</button>
              </div>
              <button className="btn-delete-stop" disabled={deletingMarker} onClick={async () => {
                if (window.confirm(`Delete "${marker.name}"?`)) {
                  setDeletingMarker(true)
                  try { await onDelete(marker.id) } finally { setDeletingMarker(false) }
                }
              }}>{deletingMarker ? '🗑 Deleting…' : '🗑 Delete this stop'}</button>
            </>
          ) : (
            <>
              <span className="vehicle-badge" style={{ background: badgeColor }}>{type}</span>
              <h2>{name}</h2>
              <p className="coords-text">{marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}</p>
              {details && <p className="marker-details">{details}</p>}
              <div className="marker-meta-row">
                {schedDisplay && <span className="marker-sched-badge">🕐 {schedDisplay}</span>}
              </div>

              {/* Social actions */}
              <div className="social-actions">
                <button className={`social-btn like-btn${marker.my_vote === 'like' ? ' active' : ''}`}
                  disabled={!!voting}
                  onClick={async () => { setVoting('like'); try { await onVote?.('terminal', marker.id, 'like') } finally { setVoting(null) } }} title="Like">
                  {voting === 'like' ? '…' : '👍'} {marker.likes || 0}
                </button>
                <button className={`social-btn dislike-btn${marker.my_vote === 'dislike' ? ' active' : ''}`}
                  disabled={!!voting}
                  onClick={async () => { setVoting('dislike'); try { await onVote?.('terminal', marker.id, 'dislike') } finally { setVoting(null) } }} title="Dislike">
                  {voting === 'dislike' ? '…' : '👎'} {marker.dislikes || 0}
                </button>
                <button className={`social-btn outdated-btn${marker.my_vote === 'outdated' ? ' active' : ''}`}
                  disabled={!!voting}
                  onClick={async () => { setVoting('outdated'); try { await onVote?.('terminal', marker.id, 'outdated') } finally { setVoting(null) } }} title="Mark as outdated">
                  {voting === 'outdated' ? '…' : '🕐'} Outdated {marker.outdated_votes > 0 ? `(${marker.outdated_votes})` : ''}
                </button>
              </div>

              {marker.creator_name && (
                <p style={{ fontSize: 11, color: '#aaa', margin: '4px 0 0' }}>
                  Added by{' '}
                  <button className="username-link" onClick={() => onOpenProfile?.(marker.created_by)}>
                    {marker.creator_name}
                  </button>
                </p>
              )}

              {/* Action row — open to all logged-in users */}
              <div className="modal-actions">
                <button className="edit-btn" onClick={() => requireAdmin(() => setEditing(true))}>
                  &#9998; Edit{!user && ' 🔒'}
                </button>
                <button className="edit-btn connect-btn"
                  onClick={() => requireAdmin(() => { onStartConnect(marker.id); onClose() })}>
                  🔗 Connect{!user && ' 🔒'}
                </button>
                <button
                  className="modal-copy-link"
                  onClick={() => {
                    const url = `${window.location.origin}${window.location.pathname}?t=${marker.id}`
                    navigator.clipboard.writeText(url).then(() => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    })
                  }}
                  aria-label="Copy link"
                >
                  {copied ? '✓ Copied!' : '🔗 Copy link'}
                </button>
              </div>

              {/* Tabs */}
              <div className="modal-tabs">
                <button className={`modal-tab${tab === 'info'     ? ' active' : ''}`} onClick={() => setTab('info')}>Connections</button>
                <button className={`modal-tab${tab === 'comments' ? ' active' : ''}`} onClick={() => setTab('comments')}>
                  Comments {comments.length > 0 ? `(${comments.length})` : ''}
                </button>
                <button className={`modal-tab${tab === 'history'  ? ' active' : ''}`} onClick={() => setTab('history')}>History</button>
              </div>

              {/* Tab: Connections */}
              {tab === 'info' && (
                <div className="connect-section">
                  {stopConns.length === 0 && <p className="connect-empty">No connections yet</p>}
                  <div className="connect-list">
                    {stopConns.map((c) => {
                      const otherId = c.fromId === marker.id ? c.toId : c.fromId
                      const other   = markers.find(m => m.id === otherId)
                      if (!other) return null
                      const sameStopConns = stopConns.filter(x => (x.fromId === marker.id ? x.toId : x.fromId) === otherId)
                      const routeNum  = sameStopConns.length > 1 ? ` (Route ${sameStopConns.indexOf(c) + 1})` : ''
                      const connFare  = c.fare != null ? `₱${c.fare}` : null
                      const connMins  = c.duration != null ? `~${Math.round(c.duration / 60)} min` : null
                      const waypoints = c.waypoints || []
                      const connColor = TYPE_COLORS[other.type] || '#888'
                      return (
                        <div key={c.id} className="connect-group">
                          <div className="connect-item connect-item-clickable"
                            onClick={() => onConnClick?.(c.id, marker.id, other.id)}
                            role="button" tabIndex={0}
                            onKeyDown={e => e.key === 'Enter' && onConnClick?.(c.id, marker.id, other.id)}>
                            <span className="line-color-dot" style={{ background: connColor }} />
                            <div className="connect-item-body">
                              <span className="connect-name">{other.name}{routeNum}</span>
                              <span className="connect-stop-meta">
                                {other.type}
                                {connMins ? ` · ${connMins}` : ''}
                                {connFare ? ` · ${connFare}` : ''}
                                {waypoints.length > 0 ? ` · ${waypoints.length} stop${waypoints.length > 1 ? 's' : ''}` : ''}
                              </span>
                            </div>
                            {user && (
                              <button className="connect-edit-btn"
                                onClick={e => {
                                  e.stopPropagation()
                                  setEditingConnId(c.id)
                                  setConnFareInput(c.fare != null ? String(c.fare) : '')
                                  setConnMinInput(c.duration != null ? String(Math.round(c.duration / 60)) : '')
                                }}
                                aria-label="Edit connection">✎</button>
                            )}
                            {user && (
                              <button className="connect-remove"
                                onClick={e => {
                                  e.stopPropagation()
                                  if (window.confirm('Remove this connection?')) onRemoveConnection(c.id)
                                }}
                                aria-label="Remove connection">&#x2715;</button>
                            )}
                          </div>
                          {editingConnId === c.id && (
                            <div className="conn-edit-form" onClick={e => e.stopPropagation()}>
                              <input
                                className="conn-edit-input"
                                type="number"
                                placeholder="Fare (₱)"
                                value={connFareInput}
                                onChange={e => setConnFareInput(e.target.value)}
                                min="0"
                              />
                              <input
                                className="conn-edit-input"
                                type="number"
                                placeholder="Minutes"
                                value={connMinInput}
                                onChange={e => setConnMinInput(e.target.value)}
                                min="0"
                              />
                              <button className="btn-save conn-edit-save" onClick={() => saveConnEdit(c.id)} disabled={savingConn}>
                                {savingConn ? 'Saving…' : 'Save'}
                              </button>
                              <button className="btn-cancel-edit" onClick={() => setEditingConnId(null)}>Cancel</button>
                            </div>
                          )}
                          {waypoints.length > 0 && (
                            <div className="waypoints-list">
                              {waypoints.map(wp => (
                                <div key={wp.id} className="waypoint-item">
                                  <span className="waypoint-dot" style={{ background: connColor }} />
                                  <span className="waypoint-name">{wp.name}</span>
                                  {user && (
                                    <button className="connect-remove" onClick={() => onRemoveWaypoint?.(c.id, wp.id)}
                                      aria-label="Remove stop">&#x2715;</button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {user && (
                            <button className="waypoint-add-btn" onClick={() => { onAddWaypoint?.(c.id); onClose() }}>
                              + Add stop along this route
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Tab: Comments */}
              {tab === 'comments' && (
                <div className="comments-section">
                  {user && (
                    <div className="comment-form">
                      <textarea
                        className="comment-input"
                        value={commentText}
                        onChange={e => setCommentText(e.target.value)}
                        placeholder="Add a comment…"
                        rows={2}
                        maxLength={500}
                      />
                      <button className="comment-submit" onClick={submitComment} disabled={!commentText.trim() || submittingComment}>
                        {submittingComment ? 'Sending…' : 'Send'}
                      </button>
                    </div>
                  )}
                  {loadingComments && <p className="comments-loading">Loading…</p>}
                  {!loadingComments && comments.length === 0 && (
                    <p className="connect-empty">No comments yet. Be the first!</p>
                  )}
                  <div className="comments-list">
                    {comments.map(c => (
                      <div key={c.id} className="comment-item">
                        <div className="comment-header">
                          <button className="username-link" onClick={() => onOpenProfile?.(c.user_id)}>
                            {BADGE_ICONS[c.badge] || '🌱'} {c.username}
                          </button>
                          <span className="comment-time">{timeAgo(c.created_at)}</span>
                          {user && String(user.id) === String(c.user_id) && (
                            <button className="comment-delete" onClick={() => deleteComment(c.id)} disabled={deletingComment === c.id} title="Delete">
                              {deletingComment === c.id ? '…' : '✕'}
                            </button>
                          )}
                        </div>
                        <p className="comment-body">{c.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab: History */}
              {tab === 'history' && (
                <div className="history-section">
                  {loadingHistory && <p className="comments-loading">Loading…</p>}
                  {!loadingHistory && history.length === 0 && (
                    <p className="connect-empty">No edits recorded yet.</p>
                  )}
                  <div className="history-list">
                    {history.map(h => (
                      <div key={h.id} className="history-item">
                        <div className="history-header">
                          <span className={`history-action history-action-${h.action}`}>{h.action}</span>
                          <button className="username-link" onClick={() => onOpenProfile?.(h.user_id)}>
                            {BADGE_ICONS[h.badge] || '🌱'} {h.username || 'unknown'}
                          </button>
                          <span className="comment-time">{timeAgo(h.created_at)}</span>
                        </div>
                        {h.summary && (
                          <p className="history-detail">{h.summary}</p>
                        )}
                        {user && h.action !== 'delete' && h.old_data && (
                          confirmRevert === h.id ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                              <span style={{ fontSize: 12, color: '#888' }}>Revert to this version?</span>
                              <button
                                className="history-revert-btn"
                                style={{ background: '#E8342A', color: '#fff' }}
                                onClick={() => { setConfirmRevert(null); revertTo(h.id) }}
                                disabled={reverting === h.id}
                              >
                                {reverting === h.id ? 'Reverting…' : 'Yes, revert'}
                              </button>
                              <button
                                className="history-revert-btn"
                                onClick={() => setConfirmRevert(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              className="history-revert-btn"
                              onClick={() => setConfirmRevert(h.id)}
                              disabled={reverting === h.id}
                            >
                              ↩ Revert to this
                            </button>
                          )
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}
