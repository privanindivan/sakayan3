import { useState, useEffect } from 'react'

// PIN is set via VITE_ADMIN_PIN in your .env / Vercel env variables.
// Note: this is client-side protection only — it prevents casual edits,
// not a determined attacker inspecting the bundle.
const ADMIN_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN || '1234'

export default function PinModal({ onSuccess, onCancel }) {
  const [pin,   setPin]   = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (pin === ADMIN_PIN) {
      onSuccess()
    } else {
      setError(true)
      setPin('')
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="pin-modal" onClick={e => e.stopPropagation()}>
        <h3 className="pin-title">Admin access</h3>
        <p className="pin-subtitle">Enter your PIN to edit stops</p>
        <form onSubmit={handleSubmit}>
          <input
            className={`pin-input${error ? ' pin-input-error' : ''}`}
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={pin}
            onChange={e => { setPin(e.target.value); setError(false) }}
            placeholder="PIN"
            autoFocus
          />
          {error && <p className="pin-err-msg">Incorrect PIN</p>}
          <div className="edit-actions" style={{ marginTop: 16 }}>
            <button type="submit" className="btn-save">Unlock</button>
            <button type="button" className="btn-cancel-edit" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}
