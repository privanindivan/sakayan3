import { useState, useRef } from 'react'

const NOMINATIM = (q) =>
  `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=ph&limit=5`

async function fetchPlaces(q) {
  if (!q.trim()) return []
  try {
    const res = await fetch(NOMINATIM(q), { headers: { 'Accept-Language': 'en' } })
    return await res.json()
  } catch { return [] }
}

export default function MapSearch({ onFlyTo }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)
  const inputRef = useRef(null)
  const debounce = useRef(null)

  const doSearch = async (q) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    const places = await fetchPlaces(q)
    setResults(places)
    setLoading(false)
  }

  const handleChange = (e) => {
    setQuery(e.target.value)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => doSearch(e.target.value), 400)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    clearTimeout(debounce.current)
    await doSearch(query)
  }

  const handleSelect = (place) => {
    const name = place.display_name.split(',')[0]
    setQuery(name)
    setResults([])
    setOpen(false)
    onFlyTo({ lat: parseFloat(place.lat), lng: parseFloat(place.lon), name })
  }

  const handleToggle = () => {
    if (open) {
      setOpen(false)
      setResults([])
      setQuery('')
    } else {
      setOpen(true)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <div className="map-search">
      {open && (
        <div className="map-search-card">
          <form className="map-search-row" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="search"
              placeholder="Search places..."
              value={query}
              onChange={handleChange}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button type="submit" className="map-search-btn" aria-label="Search">
              {loading ? '…' : '🔍'}
            </button>
          </form>

          {results.length > 0 && (
            <ul className="map-search-results" role="listbox">
              {results.map((place) => (
                <li
                  key={place.place_id}
                  onMouseDown={() => handleSelect(place)}
                  role="option"
                >
                  <span className="result-icon">&#127759;</span>
                  <span className="result-text">{place.display_name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button
        className={`icon-btn map-search-toggle ${open ? 'map-search-toggle-active' : ''}`}
        onClick={handleToggle}
        aria-label={open ? 'Close map search' : 'Search on map'}
        title={open ? 'Close' : 'Search on map'}
      >
        {open ? '✕' : '🔍'}
      </button>
    </div>
  )
}
