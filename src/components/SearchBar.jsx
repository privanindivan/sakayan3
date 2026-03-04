import { useState, useRef } from 'react'

export default function SearchBar({ onResult }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const debounce  = useRef(null)
  const inputRef  = useRef(null)

  const search = async (q) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const res  = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=ph&limit=5`,
        { headers: { 'Accept-Language': 'en' } }
      )
      setResults(await res.json())
    } catch {
      // silent — no results shown on error
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    setQuery(e.target.value)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => search(e.target.value), 400)
  }

  const handleSelect = (r) => {
    onResult({ lat: parseFloat(r.lat), lng: parseFloat(r.lon), nonce: Date.now() })
    setQuery(r.display_name.split(',')[0])
    setResults([])
    // dismiss keyboard on mobile
    inputRef.current?.blur()
  }

  const handleClear = () => {
    setQuery('')
    setResults([])
    inputRef.current?.focus()
  }

  // Close dropdown when input loses focus — delay lets result clicks register first
  const handleBlur = () => {
    setTimeout(() => setResults([]), 150)
  }

  return (
    <div className="search-bar">
      <div className="search-input-wrap">
        <span className="search-icon">&#128269;</span>
        <input
          ref={inputRef}
          type="search"
          placeholder="Search places in Philippines..."
          value={query}
          onChange={handleChange}
          onBlur={handleBlur}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {query && (
          <button className="search-clear" onClick={handleClear} aria-label="Clear">&#x2715;</button>
        )}
      </div>

      {loading && <div className="search-loading">Searching...</div>}

      {results.length > 0 && (
        <ul className="search-results" role="listbox">
          {results.map(r => (
            <li key={r.place_id} onMouseDown={() => handleSelect(r)} role="option">
              <span className="result-icon">&#128205;</span>
              <span className="result-text">{r.display_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
