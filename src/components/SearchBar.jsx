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

// Filter custom markers by name query (case-insensitive); empty query returns all
function matchMarkers(markers, query) {
  if (!query.trim()) return markers
  const q = query.toLowerCase()
  return markers.filter(m => m.name.toLowerCase().includes(q))
}

export default function SearchBar({ onRoute, onFlyTo, markers = [] }) {
  const fromRef = useRef(null)
  const toRef   = useRef(null)

  const [fromQuery,   setFromQuery]   = useState('')
  const [toQuery,     setToQuery]     = useState('')
  const [fromResults, setFromResults] = useState([]) // Nominatim only
  const [toResults,   setToResults]   = useState([])
  const [fromFocused, setFromFocused] = useState(false)
  const [toFocused,   setToFocused]   = useState(false)
  const [fromPoint,   setFromPoint]   = useState(null)
  const [toPoint,     setToPoint]     = useState(null)
  const [locating,    setLocating]    = useState(false)
  const fromDebounce = useRef(null)
  const toDebounce   = useRef(null)

  useEffect(() => {
    if (fromPoint && toPoint) onRoute(fromPoint, toPoint)
  }, [fromPoint, toPoint]) // eslint-disable-line react-hooks/exhaustive-deps

  // Build combined dropdown items for a field
  function buildDropdown(query, nominatimResults, isFrom) {
    const items = []
    // My location — only for From field
    if (isFrom) items.push({ kind: 'myloc' })
    // Custom terminals matching the query
    matchMarkers(markers, query).forEach(m => items.push({ kind: 'marker', marker: m }))
    // Nominatim results
    nominatimResults.forEach(r => items.push({ kind: 'place', result: r }))
    return items
  }

  const selectPoint = (point, setQuery, setPoint, ref) => {
    setQuery(point.name)
    setFromResults([])
    setToResults([])
    setFromFocused(false)
    setToFocused(false)
    ref.current?.blur()
    setPoint(point)
    onFlyTo?.({ lat: point.lat, lng: point.lng })
  }

  const handleFromChange = (e) => {
    setFromQuery(e.target.value)
    clearTimeout(fromDebounce.current)
    fromDebounce.current = setTimeout(async () => {
      setFromResults(await fetchPlaces(e.target.value))
    }, 400)
  }

  const handleToChange = (e) => {
    setToQuery(e.target.value)
    clearTimeout(toDebounce.current)
    toDebounce.current = setTimeout(async () => {
      setToResults(await fetchPlaces(e.target.value))
    }, 400)
  }

  const handleItemSelect = async (item, setQuery, setPoint, ref) => {
    if (item.kind === 'myloc') {
      setLocating(true)
      try {
        const pt = await getMyLocation()
        selectPoint(pt, setQuery, setPoint, ref)
      } catch { /* denied */ } finally { setLocating(false) }
    } else if (item.kind === 'marker') {
      const m = item.marker
      selectPoint({ lat: m.lat, lng: m.lng, name: m.name }, setQuery, setPoint, ref)
    } else {
      const r = item.result
      selectPoint(
        { lat: parseFloat(r.lat), lng: parseFloat(r.lon), name: r.display_name.split(',')[0] },
        setQuery, setPoint, ref
      )
    }
  }

  const handleKeyDown = async (e, query, results, isFrom) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const setQuery = isFrom ? setFromQuery : setToQuery
    const setPoint = isFrom ? setFromPoint : setToPoint
    const ref      = isFrom ? fromRef      : toRef
    const setRes   = isFrom ? setFromResults : setToResults

    // Build combined items and pick first non-myloc
    clearTimeout(isFrom ? fromDebounce.current : toDebounce.current)
    let nomResults = results
    if (!nomResults.length && query.trim()) {
      nomResults = await fetchPlaces(query)
      setRes(nomResults)
    }
    const items = buildDropdown(query, nomResults, isFrom)
    const first = items.find(i => i.kind !== 'myloc')
    if (first) handleItemSelect(first, setQuery, setPoint, ref)
  }

  const handleSwap = () => {
    const tq = toQuery; setFromQuery(tq); setToQuery(fromQuery)
    const tp = toPoint; setFromPoint(tp); setToPoint(fromPoint)
  }

  const fromDropdown = fromFocused ? buildDropdown(fromQuery, fromResults, true)  : []
  const toDropdown   = toFocused   ? buildDropdown(toQuery,   toResults,   false) : []
  const activeDropdown = fromDropdown.length ? fromDropdown : toDropdown
  const isFromActive   = fromDropdown.length > 0

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
            onFocus={() => setFromFocused(true)}
            onBlur={() => setTimeout(() => setFromFocused(false), 150)}
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
            onFocus={() => setToFocused(true)}
            onBlur={() => setTimeout(() => setToFocused(false), 150)}
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
          {activeDropdown.map((item, i) => {
            if (item.kind === 'myloc') return (
              <li
                key="myloc"
                onMouseDown={() => handleItemSelect(item,
                  isFromActive ? setFromQuery : setToQuery,
                  isFromActive ? setFromPoint : setToPoint,
                  isFromActive ? fromRef      : toRef
                )}
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
                  onMouseDown={() => handleItemSelect(item,
                    isFromActive ? setFromQuery : setToQuery,
                    isFromActive ? setFromPoint : setToPoint,
                    isFromActive ? fromRef      : toRef
                  )}
                  role="option"
                >
                  <span
                    className="result-icon result-pin"
                    style={{ color }}
                  >&#128205;</span>
                  <div className="result-text">
                    <span className="result-terminal-name">{item.marker.name}</span>
                    <span className="result-terminal-type" style={{ color }}>{item.marker.type}</span>
                  </div>
                </li>
              )
            }
            // Nominatim place
            return (
              <li
                key={item.result.place_id}
                onMouseDown={() => handleItemSelect(item,
                  isFromActive ? setFromQuery : setToQuery,
                  isFromActive ? setFromPoint : setToPoint,
                  isFromActive ? fromRef      : toRef
                )}
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
