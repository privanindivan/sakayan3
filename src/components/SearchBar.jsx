import { useState, useRef, useEffect } from 'react'
import { TYPE_COLORS } from '../data/sampleData'

const NOMINATIM = (q) =>
  `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=ph&limit=5`

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

// Empty query shows all markers; typed query filters by name
function matchMarkers(markers, query) {
  if (!query.trim()) return markers
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
  // Single active-field tracker avoids the 150ms blur race that made both fields respond at once
  const [activeField, setActiveField] = useState(null) // 'from' | 'to' | null
  const [fromPoint,   setFromPoint]   = useState(null)
  const [toPoint,     setToPoint]     = useState(null)
  const [locating,    setLocating]    = useState(false)
  const fromDebounce = useRef(null)
  const toDebounce   = useRef(null)

  // Clear all local state when App externally resets the route (e.g. DirectionPanel close)
  useEffect(() => {
    if (resetKey === 0) return
    setFromQuery(''); setToQuery('')
    setFromPoint(null); setToPoint(null)
    setFromResults([]); setToResults([])
    setActiveField(null)
  }, [resetKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync to App: start route when both confirmed, clear route when either is missing
  useEffect(() => {
    if (fromPoint && toPoint) onRoute(fromPoint, toPoint)
    else onRoute(null, null)
  }, [fromPoint, toPoint]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up debounce timers on unmount
  useEffect(() => {
    return () => {
      clearTimeout(fromDebounce.current)
      clearTimeout(toDebounce.current)
    }
  }, [])

  function buildDropdown(query, nominatimResults, isFrom) {
    const items = []
    if (isFrom) items.push({ kind: 'myloc' })
    matchMarkers(markers, query).forEach(m => items.push({ kind: 'marker', marker: m }))
    nominatimResults.forEach(r => items.push({ kind: 'place', result: r }))
    return items
  }

  const selectPoint = (point, isFrom) => {
    if (isFrom) { setFromQuery(point.name); setFromPoint(point) }
    else        { setToQuery(point.name);   setToPoint(point)   }
    setFromResults([])
    setToResults([])
    setActiveField(null)
    ;(isFrom ? fromRef : toRef).current?.blur()
    onFlyTo?.({ lat: point.lat, lng: point.lng })
  }

  // Editing text always clears the saved point — prevents stale route triggers
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
    const items = buildDropdown(query, nomResults, isFrom)
    const first = items.find(i => i.kind !== 'myloc')
    if (first) handleItemSelect(first, isFrom)
  }

  const handleSwap = () => {
    const tq = toQuery;     setFromQuery(tq);     setToQuery(fromQuery)
    const tp = toPoint;     setFromPoint(tp);     setToPoint(fromPoint)
    const tr = toResults;   setFromResults(tr);   setToResults(fromResults)
  }

  const isFrom       = activeField === 'from'
  const activeDropdown = activeField
    ? buildDropdown(
        isFrom ? fromQuery : toQuery,
        isFrom ? fromResults : toResults,
        isFrom
      )
    : []

  return (
    <div className="search-bar">
      <div className="search-card">
        {/* FROM */}
        <div className="search-row">
          <span className="route-dot from-dot" />
          <input
            ref={fromRef}
            type="search"
            placeholder="Where from?"
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
            placeholder="Where to?"
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
          {activeDropdown.map((item) => {
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
