import { useState } from 'react'
import { VEHICLE_TYPES } from '../data/sampleData'

export default function AddMarkerForm({ pendingLatLng, onSubmit, onCancel }) {
  const [name,    setName]    = useState('')
  const [type,    setType]    = useState(VEHICLE_TYPES[0])
  const [details, setDetails] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim() || !pendingLatLng) return
    onSubmit({
      name:    name.trim(),
      type,
      details: details.trim(),
      lat:     pendingLatLng.lat,
      lng:     pendingLatLng.lng,
      images:  [],
    })
    setName('')
    setDetails('')
  }

  return (
    <div className="add-form">
      <div className="add-form-header">
        <h3>Add Terminal</h3>
        <button className="form-close" onClick={onCancel} aria-label="Close">&#x2715;</button>
      </div>
      <p className="hint">&#128205; Tap the map to pin the location</p>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={e => setName(e.target.value)}
          autoComplete="off"
          required
        />

        <select value={type} onChange={e => setType(e.target.value)}>
          {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <textarea
          placeholder="Details"
          value={details}
          onChange={e => setDetails(e.target.value)}
          rows={2}
        />

        {!pendingLatLng && (
          <p className="hint" style={{ marginBottom: 8 }}>No pin yet — tap the map first</p>
        )}

        <button type="submit" className="btn-primary" disabled={!pendingLatLng}>
          Add Terminal
        </button>
      </form>
    </div>
  )
}
