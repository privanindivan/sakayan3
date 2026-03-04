import { useState, useCallback } from 'react'
import MapView       from './components/MapView'
import SearchBar     from './components/SearchBar'
import AddMarkerForm from './components/AddMarkerForm'
import MarkerModal   from './components/MarkerModal'
import { INITIAL_MARKERS } from './data/sampleData'

export default function App() {
  const [markers,        setMarkers]        = useState(INITIAL_MARKERS)
  const [selectedMarker, setSelectedMarker] = useState(null)
  const [pendingLatLng,  setPendingLatLng]  = useState(null)
  const [showForm,       setShowForm]       = useState(false)
  const [flyTo,          setFlyTo]          = useState(null)

  // Always include a nonce so searching the same place twice still fires the effect
  const handleSearchResult = useCallback((latlng) => {
    setFlyTo({ ...latlng, nonce: Date.now() })
  }, [])

  const handleMapClick = useCallback((latlng) => {
    if (showForm) setPendingLatLng(latlng)
  }, [showForm])

  // While form is open, don't open the marker modal — tap sets the pin instead
  const handleMarkerClick = useCallback((marker) => {
    if (showForm) return
    setSelectedMarker(marker)
  }, [showForm])

  const handleAddMarker = (data) => {
    setMarkers(prev => [...prev, { id: Date.now(), ...data }])
    setShowForm(false)
    setPendingLatLng(null)
  }

  const handleCancelForm = () => {
    setShowForm(false)
    setPendingLatLng(null)
  }

  const toggleForm = () => {
    if (showForm) handleCancelForm()
    else { setShowForm(true); setPendingLatLng(null) }
  }

  return (
    <div className="app">
      <SearchBar onResult={handleSearchResult} />

      <MapView
        markers={markers}
        onMarkerClick={handleMarkerClick}
        onMapClick={handleMapClick}
        flyTo={flyTo}
        addingMode={showForm}
        pendingLatLng={pendingLatLng}
      />

      <button
        className={`fab ${showForm ? 'fab-cancel' : ''}`}
        onClick={toggleForm}
        aria-label={showForm ? 'Cancel' : 'Add stop or route'}
      >
        {showForm ? '✕' : '+'}
      </button>

      {showForm && (
        <AddMarkerForm
          pendingLatLng={pendingLatLng}
          onSubmit={handleAddMarker}
          onCancel={handleCancelForm}
        />
      )}

      {selectedMarker && (
        <MarkerModal
          marker={selectedMarker}
          onClose={() => setSelectedMarker(null)}
          onSave={(updated) => {
            setMarkers(prev => prev.map(m => m.id === updated.id ? updated : m))
            setSelectedMarker(updated)
          }}
        />
      )}
    </div>
  )
}
