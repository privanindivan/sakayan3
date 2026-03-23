import { useState, useRef, useEffect } from 'react'
import { TYPE_COLORS } from '../data/sampleData'

const NOMINATIM = (q) =>
  `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=ph&limit=5`

const RECENT_KEY  = 'sakayan_recent_searches'
const RECENT_MAX  = 6

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
  return markers.filter(m => m.name.toLowerCase().includes(q))
}

export default function SearchBar({ onRoute, onFlyTo, markers = [], resetKey = 0 }) {
  const fromRef = useRef(null)
  const toRef   = useRef(null)

  const [fromQuery,   setFromQuery]   = useState('')
  const [toQuery,     setToQuery]     = useState('')
  const [fromResults, setFromResults] = useState([])
  const [toResults,   setToResults]   = useState([])
  const [activeField, setActiveField] = useState(null) // 'from' | 'to' | null
  const [fromPoint,   setFromPoint]   = useState(null)
  const [toPoint,     setToPoint]     = useState(null)
  const [locating,    setLocating]    = useState(false)
  const [recent,      setRecent]      = useState(loadRecent)
  const fromDebounce = useRef(null)
  const toDebounce   = useRef(null)

  useEffect(() => {
    if (resetKey === 0) return
    setFromQuery(''); setToQuery('')
    setFromPoint(null); setToPoint(null)
    setFromResults([]); setToResults([])
    setActiveField(null)
  }, [resetKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (fromPoint && toPoint) onRoute(fromPoint, toPoint)
    else onRoute(null, null)
  }, [fromPoint, toPoint]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      clearTimeout(fromDebounce.current)
      clearTimeout(toDebounce.current)
    }
  }, [])

  function buildDropdown(query, nominatimResults, isFrom) {
    const items = []
    if (isFrom && query.trim()) items.push({ kind: 'myloc' })

    if (!query.trim()) {
      // No text → show recents
      recent.forEach(r => items.push({ kind: 'recent', point: r }))
    } else {
      matchMarkers(markers, query).forEach(m => items.push({ kind: 'marker', marker: m }))
      nominatimResults.forEach(r => items.push({ kind: 'place', result: r }))
    }
    return items
  }

  const selectPoint = (point, isFrom) => {
    saveRecent(point)
    setRecent(loadRecent())
    if (isFrom) { setFromQuery(point.name); setFromPoint(point) }
    else        { setToQuery(point.name);   setToPoint(point)   }
    setFromResults([])
    setToResults([])
    setActiveField(null)
    ;(isFrom ? fromRef : toRef).current?.blur()
    onFlyTo?.({ lat: point.lat, lng: point.lng })
  }

  const handleFromChange = (e) => {
    setFromQuery(e.target.value)
    setFromPoint(null)
    clearTimeout(fromDebounce.current)
    fromDebounce.current = setTimeout(async () => {
      setFromResults(await fetchPlaces(e.target.value))
    }, 400)
  }

  const handleToChange = (e) => {
    setToQuery(e.target.value)
    setToPoint(null)
    clearTimeout(toDebounce.current)
    toDebounce.current = setTimeout(async () => {
      setToResults(await fetchPlaces(e.target.value))
    }, 400)
  }

  const handleItemSelect = async (item, isFrom) => {
    if (item.kind === 'myloc') {
      setLocating(true)
      try {
        const pt = await getMyLocation()
        selectPoint(pt, isFrom)
      } catch { /* denied */ } finally { setLocating(false) }
    } else if (item.kind === 'recent') {
      selectPoint(item.point, isFrom)
    } else if (item.kind === 'marker') {
      const m = item.marker
      selectPoint({ lat: m.lat, lng: m.lng, name: m.name }, isFrom)
    } else {
      const r = item.result
      selectPoint(
        { lat: parseFloat(r.lat), lng: parseFloat(r.lon), name: r.display_name.split(',')[0] },
        isFrom
      )
    }
  }

  const handleKeyDown = async (e, query, results, isFrom) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const setRes = isFrom ? setFromResults : setToResults
    clearTimeout(isFrom ? fromDebounce.current : toDebounce.current)
    let nomResults = results
    if (!nomResults.length && query.trim()) {
      nomResults = await fetchPlaces(query)
      setRes(nomResults)
    }
    const items = buildDropdown(query, nomResults, isFrom).filter(i => i.kind !== 'myloc')
    const first = items.find(i => i.kind !== 'myloc')
    if (first) handleItemSelect(first, isFrom)
  }

  const handleSwap = () => {
    const tq = toQuery;     setFromQuery(tq);     setToQuery(fromQuery)
    const tp = toPoint;     setFromPoint(tp);     setToPoint(fromPoint)
    const tr = toResults;   setFromResults(tr);   setToResults(fromResults)
  }

  const isFrom         = activeField === 'from'
  const activeQuery    = isFrom ? fromQuery : toQuery
  const activeResults  = isFrom ? fromResults : toResults
  const activeDropdown = activeField
    ? buildDropdown(activeQuery, activeResults, isFrom)
    : []

  const removeRecent = (e, name) => {
    e.stopPropagation()
    const updated = loadRecent().filter(r => r.name !== name)
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(updated)) } catch { /* */ }
    setRecent(updated)
  }

  return (
    <div className="search-bar">
      <div className="search-card">
        {/* FROM */}
        <div className="search-row">
          <span className="route-dot from-dot" />
          <input
            ref={fromRef}
            type="search"
            placeholder="From"
            value={fromQuery}
            onChange={handleFromChange}
            onFocus={() => setActiveField('from')}
            onBlur={() => setTimeout(() => setActiveField(f => f === 'from' ? null : f), 150)}
            onKeyDown={e => handleKeyDown(e, fromQuery, fromResults, true)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        <div className="search-divider">
          <div className="route-line" />
          <button className="swap-btn" onClick={handleSwap} aria-label="Swap">&#8645;</button>
        </div>

        {/* TO */}
        <div className="search-row">
          <span className="route-dot to-dot" />
          <input
            ref={toRef}
            type="search"
            placeholder="To"
            value={toQuery}
            onChange={handleToChange}
            onFocus={() => setActiveField('to')}
            onBlur={() => setTimeout(() => setActiveField(f => f === 'to' ? null : f), 150)}
            onKeyDown={e => handleKeyDown(e, toQuery, toResults, false)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Dropdown */}
      {activeDropdown.length > 0 && (
        <ul className="search-results" role="listbox">
          {activeDropdown.map((item, idx) => {
            if (item.kind === 'myloc') return (
              <li
                key="myloc"
                onMouseDown={() => handleItemSelect(item, true)}
                role="option"
                className="result-myloc"
              >
                <span className="result-icon">{locating ? '…' : '📍'}</span>
                <span className="result-text">{locating ? 'Getting location…' : 'Use my location'}</span>
              </li>
            )
            if (item.kind === 'recent') return (
              <li
                key={`recent-${item.point.name}`}
                onMouseDown={() => handleItemSelect(item, isFrom)}
                role="option"
                className="result-recent"
              >
                <span className="result-icon result-recent-icon">🕐</span>
                <span className="result-text result-recent-name">{item.point.name}</span>
                <button
                  className="result-recent-remove"
                  onMouseDown={e => removeRecent(e, item.point.name)}
                  aria-label="Remove from recent"
                  title="Remove"
                >✕</button>
              </li>
            )
            if (item.kind === 'marker') {
              const color = TYPE_COLORS[item.marker.type] || '#888'
              return (
                <li
                  key={`m-${item.marker.id}`}
                  onMouseDown={() => handleItemSelect(item, isFrom)}
                  role="option"
                >
                  <span className="result-icon result-pin" style={{ color }}>&#128205;</span>
                  <div className="result-text">
                    <span className="result-terminal-name">{item.marker.name}</span>
                    <span className="result-terminal-type" style={{ color }}>{item.marker.type}</span>
                  </div>
                </li>
              )
            }
            return (
              <li
                key={item.result.place_id}
                onMouseDown={() => handleItemSelect(item, isFrom)}
                role="option"
              >
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
