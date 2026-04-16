'use client'
import { useEffect, useState, useRef } from 'react'

type Terminal = { id: string; name: string; lat: number; lng: number }

export default function GrabmapsChecklist() {
  const [terminals, setTerminals] = useState<Terminal[]>([])
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const saveQueue = useRef<Record<string, boolean>>({})
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/grabmaps-checklist')
      .then(r => r.json())
      .then(({ terminals, checked }) => {
        setTerminals(terminals)
        setChecked(checked)
        setLoading(false)
      })
  }, [])

  function toggle(id: string, val: boolean) {
    setChecked(prev => {
      const next = { ...prev }
      if (val) next[id] = true
      else delete next[id]
      return next
    })
    // Queue save
    saveQueue.current[id] = val
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flushSave, 600)
  }

  async function flushSave() {
    const batch = { ...saveQueue.current }
    saveQueue.current = {}
    for (const [id, value] of Object.entries(batch)) {
      await fetch('/api/grabmaps-checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, value }),
      })
    }
  }

  const filtered = terminals.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  )
  const doneCount = Object.keys(checked).length
  const total = terminals.length

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 700, margin: '0 auto', padding: '16px' }}>
      <h2 style={{ margin: '0 0 8px' }}>GrabMaps Checklist</h2>
      <p style={{ margin: '0 0 12px', color: '#555', fontSize: 14 }}>
        {loading ? 'Loading...' : `${doneCount} / ${total} done`}
        {!loading && doneCount > 0 && (
          <span style={{ marginLeft: 10, color: '#22c55e', fontWeight: 600 }}>
            ({Math.round(doneCount / total * 100)}%)
          </span>
        )}
      </p>
      <input
        type="search"
        placeholder="Search terminals..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', padding: '8px 12px', fontSize: 15,
          border: '1px solid #ccc', borderRadius: 8, marginBottom: 12,
          boxSizing: 'border-box',
        }}
      />
      {/* Progress bar */}
      <div style={{ background: '#e5e7eb', borderRadius: 6, height: 8, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ background: '#22c55e', height: '100%', width: `${total ? doneCount / total * 100 : 0}%`, transition: 'width 0.3s' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map(t => {
          const done = !!checked[t.id]
          return (
            <label
              key={t.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                background: done ? '#f0fdf4' : '#fafafa',
                border: `1px solid ${done ? '#86efac' : '#e5e7eb'}`,
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={done}
                onChange={e => toggle(t.id, e.target.checked)}
                style={{ width: 17, height: 17, accentColor: '#22c55e', flexShrink: 0 }}
              />
              <span style={{
                flex: 1, fontSize: 14,
                textDecoration: done ? 'line-through' : 'none',
                color: done ? '#86efac' : '#111',
              }}>
                {t.name}
              </span>
              <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                {Number(t.lat).toFixed(5)}, {Number(t.lng).toFixed(5)}
              </span>
            </label>
          )
        })}
      </div>

      {filtered.length === 0 && !loading && (
        <p style={{ textAlign: 'center', color: '#9ca3af', marginTop: 40 }}>No terminals found</p>
      )}
    </div>
  )
}
