import { useState, useRef, useEffect } from 'react'
import { TYPE_COLORS } from '../data/sampleData'

const NOMINATIM = (q) =>
  `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=ph&limit=5`

const RECENT_KEY = 'sakayan_recent_searches'
const RECENT_MAX = 6

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}
function saveRecent(point) {
  const prev    = loadRecent().filter(r => r.name !== point.name)
  const updated = [{ lat: point.lat, lng: point.lng, name: point.name }, ...prev].slice(0, RECENT_MAX)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(updated)) } catch { /* quota */ }
}

async function fetchPlaces(q) {
  if (!q.trim()) return []
  try {
    const res = await fetch(NOMINATIM(q), { headers: { 'Accept-Language': 'en' } })
    return await res.json()
  } catch { return [] }
}

function getMyLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(); return }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, name: 'My location' }),
      reject,
      { enableHighAccuracy: true, timeout: 8000 }
    )
  })
}

function matchMarkers(markers, query) {
  if (!query.trim()) return []
  const q = query.toLowerCase()
  return markers.filter(m => m.name.toLowerCase().includes(q)).slice(0, 5)
}

export default function SearchBar({ onFlyTo, markers = [], resetKey = 0 }) {
  const inputRef = useRef(null)
  const debounce = useRef(null)

  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState([])
  const [open,     setOpen]     = useState(false)
  const [locating, setLocating] = useState(false)
  const [recent,   setRecent]   = useState(loadRecent)

  useEffect(() => {
    if (resetKey === 0) return
    setQuery(''); setResults([]); setOpen(false)
  }, [resetKey])

  useEffect(() => () => clearTimeout(debounce.current), [])

  function buildDropdown() {
    const items = []
    items.push({ kind: 'myloc' })
    if (!query.trim()) {
      recent.forEach(r => items.push({ kind: 'recent', point: r }))
    } else {
      matchMarkers(markers, query).forEach(m => items.push({ kind: 'marker', marker: m }))
      results.forEach(r => items.push({ kind: 'place', result: r }))
    }
    return items
  }

  const selectPoint = (point) => {
    saveRecent(point)
    setRecent(loadRecent())
    setQuery(point.name)
    setResults([])
    setOpen(false)
    inputRef.current?.blur()
    onFlyTo?.({ lat: point.lat, lng: point.lng })
  }

  const handleChange = (e) => {
    setQuery(e.target.value)
    setOpen(true)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      setResults(await fetchPlaces(e.target.value))
    }, 400)
  }

  const handleItemSelect = async (item) => {
    if (item.kind === 'myloc') {
      setLocating(true)
      try { selectPoint(await getMyLocation()) }
      catch { /* denied */ } finally { setLocating(false) }
    } else if (item.kind === 'recent') {
      selectPoint(item.point)
    } else if (item.kind === 'marker') {
      const m = item.marker
      selectPoint({ id: m.id, lat: m.lat, lng: m.lng, name: m.name })
    } else {
      const r = item.result
      selectPoint({ lat: parseFloat(r.lat), lng: parseFloat(r.lon), name: r.display_name.split(',')[0] })
    }
  }

  const handleKeyDown = async (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    clearTimeout(debounce.current)
    let nom = results
    if (!nom.length && query.trim()) { nom = await fetchPlaces(query); setResults(nom) }
    const items = buildDropdown().filter(i => i.kind !== 'myloc')
    const first = items[0]
    if (first) handleItemSelect(first)
  }

  const removeRecent = (e, name) => {
    e.stopPropagation()
    const updated = loadRecent().filter(r => r.name !== name)
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(updated)) } catch { /* */ }
    setRecent(updated)
  }

  const dropdown = open ? buildDropdown() : []

  return (
    <div className="search-bar">
      <div className="search-card" style={{ borderRadius: dropdown.length ? '12px 12px 0 0' : undefined }}>
        <div className="search-row">
          <svg className="route-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="23" y1="23" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            type="search"
            placeholder="Search a place or terminal…"
            value={query}
            onChange={handleChange}
            onFocus={(e) => { setOpen(true); e.target.select() }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      </div>

      {dropdown.length > 0 && (
        <ul className="search-results" role="listbox">
          {dropdown.map((item, idx) => {
            if (item.kind === 'myloc') return (
              <li key="myloc" onMouseDown={() => handleItemSelect(item)} role="option" className="result-myloc">
                <span className="result-icon">{locating ? '…' : '📍'}</span>
                <span className="result-text">{locating ? 'Getting location…' : 'Use my location'}</span>
              </li>
            )
            if (item.kind === 'recent') return (
              <li key={`recent-${item.point.name}`} onMouseDown={() => handleItemSelect(item)} role="option" className="result-recent">
                <span className="result-icon result-recent-icon">🕐</span>
                <span className="result-text result-recent-name">{item.point.name}</span>
                <button className="result-recent-remove" onMouseDown={e => removeRecent(e, item.point.name)} aria-label="Remove from recent" title="Remove">✕</button>
              </li>
            )
            if (item.kind === 'marker') {
              const color = TYPE_COLORS[item.marker.type] || '#888'
              return (
                <li key={`m-${item.marker.id}`} onMouseDown={() => handleItemSelect(item)} role="option">
                  <span className="result-icon result-pin" style={{ color }}>&#128205;</span>
                  <div className="result-text">
                    <span className="result-terminal-name">{item.marker.name}</span>
                    <span className="result-terminal-type" style={{ color }}>{item.marker.type}</span>
                  </div>
                </li>
              )
            }
            return (
              <li key={item.result.place_id} onMouseDown={() => handleItemSelect(item)} role="option">
                <span className="result-icon">&#127759;</span>
                <span className="result-text">{item.result.display_name}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
