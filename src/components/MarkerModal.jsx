import { useEffect, useState, useRef } from 'react'
import ImageCarousel from './ImageCarousel'
import { TYPE_COLORS, VEHICLE_TYPES } from '../data/sampleData'

const DAY_PRESETS = ['Daily', 'Weekdays (Mon–Fri)', 'Mon–Sat', 'Weekends', 'Custom']
const DAY_LABELS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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
  if (typeof s === 'string') return s  // legacy plain text
  const { days, start, end, customDays } = s
  const dayStr  = days === 'Custom' && customDays?.length ? customDays.join(', ') : days
  const s12     = fmt12(start)
  const e12     = fmt12(end)
  const timeStr = s12 && e12 ? `${s12} – ${e12}` : s12 || e12 || ''
  return [dayStr, timeStr].filter(Boolean).join(' · ')
}

export default function MarkerModal({
  marker, lines,
  isAdmin, requireAdmin,
  onClose, onSave, onDelete, onDeleteLine,
}) {
  const [editing,  setEditing]  = useState(false)
  const [name,     setName]     = useState(marker.name)
  const [type,     setType]     = useState(marker.type)
  const [details,  setDetails]  = useState(marker.details || '')
  const [fare,     setFare]     = useState(marker.fare != null ? String(marker.fare) : '')
  const [sched,    setSched]    = useState(() => initSched(marker.schedule))
  const [images,   setImages]   = useState(marker.images)
  const fileInputRef = useRef(null)

  // Lines that include this stop
  const stopLines = lines.filter(l => l.stopIds.includes(marker.id))

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleFilePick = (e) => {
    const files = Array.from(e.target.files)
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => setImages(prev => [...prev, ev.target.result])
      reader.readAsDataURL(file)
    })
    e.target.value = ''
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
    onSave({
      ...marker,
      name:     name.trim(),
      type,
      details:  details.trim(),
      fare:     fare !== '' ? Number(fare) : null,
      schedule: scheduleValue,
      images,
    })
    setEditing(false)
  }

  const handleCancel = () => {
    setName(marker.name)
    setType(marker.type)
    setDetails(marker.details || '')
    setFare(marker.fare != null ? String(marker.fare) : '')
    setSched(initSched(marker.schedule))
    setImages(marker.images)
    setEditing(false)
  }

  const badgeColor    = TYPE_COLORS[type] || '#1a73e8'
  const schedDisplay  = formatSchedule(marker.schedule)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">&#x2715;</button>

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

              {/* Fare */}
              <label className="edit-label">Starting fare (₱)</label>
              <div className="fare-input-wrap">
                <span className="fare-prefix">₱</span>
                <input
                  className="edit-field fare-input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  value={fare}
                  onChange={e => setFare(e.target.value)}
                  placeholder="e.g. 13"
                />
              </div>

              {/* Schedule */}
              <label className="edit-label">Schedule</label>
              <select
                className="edit-field"
                value={sched.days}
                onChange={e => setSched(s => ({ ...s, days: e.target.value }))}
              >
                {DAY_PRESETS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>

              {sched.days === 'Custom' && (
                <div className="day-check-row">
                  {DAY_LABELS.map(day => (
                    <button
                      key={day}
                      type="button"
                      className={`day-check-btn${sched.customDays.includes(day) ? ' active' : ''}`}
                      onClick={() => toggleCustomDay(day)}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              )}

              <div className="time-range-row">
                <div className="time-field">
                  <span className="time-label">From</span>
                  <input
                    type="time"
                    className="edit-field time-input"
                    value={sched.start}
                    onChange={e => setSched(s => ({ ...s, start: e.target.value }))}
                  />
                </div>
                <div className="time-field">
                  <span className="time-label">To</span>
                  <input
                    type="time"
                    className="edit-field time-input"
                    value={sched.end}
                    onChange={e => setSched(s => ({ ...s, end: e.target.value }))}
                  />
                </div>
              </div>

              {/* Photos */}
              <label className="edit-label">Photos</label>
              <div className="photo-grid">
                {images.map((src, i) => (
                  <div key={i} className="photo-thumb">
                    <img src={src} alt={`photo ${i + 1}`} />
                    <button className="photo-remove" onClick={() => removeImage(i)} aria-label="Remove photo">&#x2715;</button>
                  </div>
                ))}
                <button className="photo-add" onClick={() => fileInputRef.current?.click()} aria-label="Add photo">
                  <span>+</span>
                  <span className="photo-add-label">Add</span>
                </button>
              </div>

              <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFilePick} />

              <p className="coords-text" style={{ marginTop: 12 }}>
                {marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}
              </p>

              <div className="edit-actions">
                <button className="btn-save" onClick={handleSave}>Save</button>
                <button className="btn-cancel-edit" onClick={handleCancel}>Cancel</button>
              </div>

              <button
                className="btn-delete-stop"
                onClick={() => {
                  if (window.confirm(`Delete "${marker.name}"? This cannot be undone.`)) {
                    onDelete(marker.id)
                  }
                }}
              >
                🗑 Delete this stop
              </button>
            </>
          ) : (
            <>
              <span className="vehicle-badge" style={{ background: badgeColor }}>{type}</span>
              <h2>{name}</h2>
              <p className="coords-text">{marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}</p>

              {details && <p className="marker-details">{details}</p>}

              <div className="marker-meta-row">
                {marker.fare != null && (
                  <span className="marker-fare-badge">₱{marker.fare} base fare</span>
                )}
                {schedDisplay && (
                  <span className="marker-sched-badge">🕐 {schedDisplay}</span>
                )}
              </div>

              {/* Action row: Edit (admin-gated) */}
              <div className="modal-actions">
                <button className="edit-btn" onClick={() => requireAdmin(() => setEditing(true))}>
                  &#9998; Edit{!isAdmin && ' 🔒'}
                </button>
              </div>

              {/* Route lines this stop belongs to */}
              <div className="connect-section">
                <span className="connect-label">Route lines</span>
                {stopLines.length === 0 && (
                  <p className="connect-empty">Not on any route line yet</p>
                )}
                {stopLines.length > 0 && (
                  <div className="connect-list">
                    {stopLines.map(l => (
                      <div key={l.id} className="connect-item">
                        <span
                          className="line-color-dot"
                          style={{ background: l.color }}
                        />
                        <span className="connect-name">{l.name}</span>
                        <span className="connect-stop-count">{l.stopIds.length} stops</span>
                        {isAdmin && (
                          <button
                            className="connect-remove"
                            onClick={() => {
                              if (window.confirm(`Delete line "${l.name}"?`)) onDeleteLine(l.id)
                            }}
                            aria-label="Delete line"
                          >
                            &#x2715;
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
