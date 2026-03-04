import { useState, useRef, useEffect } from 'react'

function useNominatim(onSelect, inputRef) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const debounce = useRef(null)

  const search = async (q) => {
    if (!q.trim()) { setResults([]); return }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=ph&limit=5`,
        { headers: { 'Accept-Language': 'en' } }
      )
      setResults(await res.json())
    } catch { /* silent */ }
  }

  const handleChange = (e) => {
    setQuery(e.target.value)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => search(e.target.value), 400)
  }

  const handleSelect = (r) => {
    const name = r.display_name.split(',')[0]
    setQuery(name)
    setResults([])
    inputRef.current?.blur()
    onSelect({ lat: parseFloat(r.lat), lng: parseFloat(r.lon), name })
  }

  const handleBlur = () => setTimeout(() => setResults([]), 150)

  const clear = () => { setQuery(''); setResults([]) }

  return { query, setQuery, results, handleChange, handleSelect, handleBlur, clear }
}

export default function SearchBar({ onRoute }) {
  const fromRef = useRef(null)
  const toRef   = useRef(null)

  const [fromPoint, setFromPoint] = useState(null)
  const [toPoint,   setToPoint]   = useState(null)

  const from = useNominatim((pt) => setFromPoint(pt), fromRef)
  const to   = useNominatim((pt) => setToPoint(pt),   toRef)

  // Fire route when both points are ready
  useEffect(() => {
    if (fromPoint && toPoint) onRoute(fromPoint, toPoint)
  }, [fromPoint, toPoint]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSwap = () => {
    const tmpPoint = fromPoint
    const tmpQuery = from.query
    from.setQuery(to.query)
    to.setQuery(tmpQuery)
    setFromPoint(toPoint)
    setToPoint(tmpPoint)
  }

  const activeResults = from.results.length ? from.results
    : to.results.length   ? to.results
    : []
  const activeSelect = from.results.length ? from.handleSelect : to.handleSelect

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
            value={from.query}
            onChange={from.handleChange}
            onBlur={from.handleBlur}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {from.query && (
            <button className="search-clear" onClick={from.clear} aria-label="Clear">&#x2715;</button>
          )}
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
            value={to.query}
            onChange={to.handleChange}
            onBlur={to.handleBlur}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {to.query && (
            <button className="search-clear" onClick={to.clear} aria-label="Clear">&#x2715;</button>
          )}
        </div>
      </div>

      {/* Shared dropdown */}
      {activeResults.length > 0 && (
        <ul className="search-results" role="listbox">
          {activeResults.map(r => (
            <li key={r.place_id} onMouseDown={() => activeSelect(r)} role="option">
              <span className="result-icon">&#128205;</span>
              <span className="result-text">{r.display_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
