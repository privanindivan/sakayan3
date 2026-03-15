'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import AuthModal from '@/components/AuthModal';
import AddStopModal from '@/components/AddStopModal';
import RoutePanel from '@/components/RoutePanel';

// Dynamically import map to avoid SSR issues
const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [routes, setRoutes] = useState<any[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<any>(null);
  const [pendingStop, setPendingStop] = useState<{ lat: number; lng: number } | null>(null);
  const [stops, setStops] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchPin, setSearchPin] = useState<{ lat: number; lng: number; name: string } | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setUser(d.user));
    fetch('/api/routes').then(r => r.json()).then(d => setRoutes(d.routes || []));
  }, []);

  useEffect(() => {
    // Load all stops for all routes
    async function loadAllStops() {
      const allStops: any[] = [];
      for (const route of routes) {
        const res = await fetch(`/api/routes/${route.id}/stops`);
        const d = await res.json();
        allStops.push(...(d.stops || []).map((s: any) => ({ ...s, routeColor: route.color_hex })));
      }
      setStops(allStops);
    }
    if (routes.length > 0) loadAllStops();
  }, [routes]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
    const data = await res.json();
    setSearchResults(data.results || []);
  }

  function handleMapClick(lat: number, lng: number) {
    if (!user) { setShowAuth(true); return; }
    setPendingStop({ lat, lng });
  }

  function handleStopSaved(stop: any) {
    setStops(prev => [...prev, stop]);
    setPendingStop(null);
  }

  function handleRouteDeleted(routeId: string) {
    setRoutes(prev => prev.filter(r => r.id !== routeId));
    setSelectedRoute(null);
  }

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Search Bar */}
      <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-1">
        <form onSubmit={handleSearch} className="flex gap-1">
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search places in PH..."
            className="w-64 bg-white rounded-lg shadow-lg px-3 py-2 text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            type="submit"
            className="bg-white rounded-lg shadow-lg px-3 py-2 text-sm border border-gray-200 hover:bg-gray-50"
          >
            &#128269;
          </button>
        </form>
        {searchResults.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 max-h-48 overflow-y-auto">
            {searchResults.map((r, i) => (
              <button
                key={i}
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b last:border-b-0"
                onClick={() => {
                  setSearchPin({ lat: r.lat, lng: r.lng, name: r.name });
                  setSearchResults([]);
                  setSearchQuery('');
                }}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Auth Button */}
      <div className="absolute top-4 right-4 z-[1000]">
        {user ? (
          <div className="flex items-center gap-2 bg-white rounded-lg shadow-lg px-3 py-2 border border-gray-200">
            <span className="text-sm font-medium text-gray-700">{user.username}</span>
            <button
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                setUser(null);
              }}
              className="text-xs text-gray-400 hover:text-red-500"
            >
              Logout
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAuth(true)}
            className="bg-blue-600 text-white rounded-lg shadow-lg px-4 py-2 text-sm font-medium hover:bg-blue-700"
          >
            Login / Register
          </button>
        )}
      </div>

      {/* Map */}
      <MapView
        routes={routes}
        stops={stops}
        searchPin={searchPin}
        onMapClick={handleMapClick}
        onRouteClick={setSelectedRoute}
        user={user}
        onLoginRequired={() => setShowAuth(true)}
        onStopUpdated={(updatedStop) => setStops(prev => prev.map(s => s.id === updatedStop.id ? updatedStop : s))}
        onStopDeleted={(stopId) => setStops(prev => prev.filter(s => s.id !== stopId))}
      />

      {/* Route Panel */}
      {selectedRoute && (
        <RoutePanel
          route={selectedRoute}
          user={user}
          onClose={() => setSelectedRoute(null)}
          onEdit={(r) => { /* TODO: edit modal */ }}
          onDelete={handleRouteDeleted}
          onLoginRequired={() => setShowAuth(true)}
        />
      )}

      {/* Add Stop Modal */}
      {pendingStop && user && (
        <AddStopModal
          lat={pendingStop.lat}
          lng={pendingStop.lng}
          routes={routes}
          onClose={() => setPendingStop(null)}
          onSave={handleStopSaved}
        />
      )}

      {/* Auth Modal */}
      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onSuccess={(u) => { setUser(u); setShowAuth(false); }}
        />
      )}
    </div>
  );
}
