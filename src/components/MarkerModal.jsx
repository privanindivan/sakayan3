import { useEffect, useState } from 'react'
import ImageCarousel from './ImageCarousel'
import { TYPE_COLORS, VEHICLE_TYPES } from '../data/sampleData'

export default function MarkerModal({ marker, onClose, onSave }) {
  const [editing,  setEditing]  = useState(false)
  const [name,     setName]     = useState(marker.name)
  const [type,     setType]     = useState(marker.type)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSave = () => {
    if (!name.trim()) return
    onSave({ ...marker, name: name.trim(), type })
    setEditing(false)
  }

  const handleCancel = () => {
    setName(marker.name)
    setType(marker.type)
    setEditing(false)
  }

  const badgeColor = TYPE_COLORS[type] || '#1a73e8'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">&#x2715;</button>

        <ImageCarousel images={marker.images} />

        <div className="modal-body">
          {editing ? (
            <>
              <input
                className="edit-name-input"
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
              />
              <select
                className="edit-type-select"
                value={type}
                onChange={e => setType(e.target.value)}
              >
                {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <p className="coords-text">
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
              <button className="edit-btn" onClick={() => setEditing(true)}>
                &#9998; Edit
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
