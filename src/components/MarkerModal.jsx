import { useEffect, useState, useRef } from 'react'
import ImageCarousel from './ImageCarousel'
import { TYPE_COLORS, VEHICLE_TYPES } from '../data/sampleData'

export default function MarkerModal({
  marker, allMarkers, connections,
  onClose, onSave, onDisconnect, onStartConnect,
}) {
  const [editing,  setEditing]  = useState(false)
  const [name,     setName]     = useState(marker.name)
  const [type,     setType]     = useState(marker.type)
  const [details,  setDetails]  = useState(marker.details || '')
  const [schedule, setSchedule] = useState(marker.schedule || '')
  const [images,   setImages]   = useState(marker.images)
  const fileInputRef = useRef(null)

  // Compute connected markers
  const connectedMarkers = connections
    .filter(c => c.fromId === marker.id || c.toId === marker.id)
    .map(c => allMarkers.find(m => m.id === (c.fromId === marker.id ? c.toId : c.fromId)))
    .filter(Boolean)

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

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    if (!name.trim()) return
    onSave({ ...marker, name: name.trim(), type, details: details.trim(), schedule: schedule.trim(), images })
    setEditing(false)
  }

  const handleCancel = () => {
    setName(marker.name)
    setType(marker.type)
    setDetails(marker.details || '')
    setSchedule(marker.schedule || '')
    setImages(marker.images)
    setEditing(false)
  }

  const badgeColor = TYPE_COLORS[type] || '#1a73e8'

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
              <select
                className="edit-field"
                value={type}
                onChange={e => setType(e.target.value)}
              >
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
              <textarea
                className="edit-field edit-textarea"
                value={schedule}
                onChange={e => setSchedule(e.target.value)}
                placeholder="e.g. Mon–Sat 5:00 AM – 10:00 PM"
                rows={3}
              />

              <label className="edit-label">Photos</label>
              <div className="photo-grid">
                {images.map((src, i) => (
                  <div key={i} className="photo-thumb">
                    <img src={src} alt={`photo ${i + 1}`} />
                    <button
                      className="photo-remove"
                      onClick={() => removeImage(i)}
                      aria-label="Remove photo"
                    >&#x2715;</button>
                  </div>
                ))}
                <button
                  className="photo-add"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Add photo"
                >
                  <span>+</span>
                  <span className="photo-add-label">Add</span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleFilePick}
              />

              <p className="coords-text" style={{ marginTop: 12 }}>
                {marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}
              </p>

              <div className="edit-actions">
                <button className="btn-save" onClick={handleSave}>Save</button>
                <button className="btn-cancel-edit" onClick={handleCancel}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <span className="vehicle-badge" style={{ background: badgeColor }}>
                {type}
              </span>
              <h2>{name}</h2>
              <p className="coords-text">
                {marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}
              </p>
              {details && (
                <p className="marker-details">{details}</p>
              )}
              {marker.schedule && (
                <p className="marker-schedule">🕐 {marker.schedule}</p>
              )}

              {/* Action row: Edit + Connect */}
              <div className="modal-actions">
                <button className="edit-btn" onClick={() => setEditing(true)}>
                  &#9998; Edit
                </button>
                <button className="modal-connect-btn" onClick={() => onStartConnect(marker.id)}>
                  + Connect
                </button>
              </div>

              {/* Connections list */}
              <div className="connect-section">
                <span className="connect-label">Connected stops</span>
                {connectedMarkers.length === 0 && (
                  <p className="connect-empty">No connections yet</p>
                )}
                {connectedMarkers.length > 0 && (
                  <div className="connect-list">
                    {connectedMarkers.map(m => (
                      <div key={m.id} className="connect-item">
                        <span
                          className="vehicle-badge-sm"
                          style={{ background: TYPE_COLORS[m.type] || '#888' }}
                        >
                          {m.type}
                        </span>
                        <span className="connect-name">{m.name}</span>
                        <button
                          className="connect-remove"
                          onClick={() => onDisconnect(marker.id, m.id)}
                          aria-label="Disconnect"
                        >&#x2715;</button>
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
