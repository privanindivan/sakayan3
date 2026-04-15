'use client';
import { useEffect, useRef } from 'react';

interface Props {
  routes: any[];
  stops: any[];
  searchPin: { lat: number; lng: number; name: string } | null;
  onMapClick: (lat: number, lng: number) => void;
  onRouteClick: (route: any) => void;
  user: any;
  onLoginRequired: () => void;
  onStopUpdated: (stop: any) => void;
  onStopDeleted: (stopId: string) => void;
}

export default function MapView({
  routes, stops, searchPin, onMapClick, onRouteClick, user, onLoginRequired, onStopUpdated, onStopDeleted
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const stopLayersRef = useRef<any[]>([]);
  const routeLayersRef = useRef<any[]>([]);
  const searchPinRef = useRef<any>(null);

  const defaultLat = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LAT || '14.5995');
  const defaultLng = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LNG || '120.9842');
  const defaultZoom = parseInt(process.env.NEXT_PUBLIC_DEFAULT_ZOOM || '13');

  useEffect(() => {
    if (typeof window === 'undefined' || leafletMapRef.current) return;

    const L = require('leaflet');
    require('leaflet/dist/leaflet.css');

    const map = L.map(mapRef.current, {
      center: [defaultLat, defaultLng],
      zoom: defaultZoom,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    map.on('click', (e: any) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    });

    leafletMapRef.current = map;

    return () => {
      map.remove();
      leafletMapRef.current = null;
    };
  }, []);

  // Render stops
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    const L = require('leaflet');

    stopLayersRef.current.forEach(l => l.remove());
    stopLayersRef.current = [];

    stops.forEach(stop => {
      const marker = L.circleMarker([stop.lat, stop.lng], {
        radius: 8,
        fillColor: stop.routeColor || '#3B82F6',
        color: '#fff',
        weight: 2,
        fillOpacity: 0.9,
      }).addTo(map);

      const canEdit = user && (user.id === stop.created_by || user.role === 'admin');

      // Serve Cloudinary images as compressed thumbnails (w300/h100, auto quality+format)
      // to avoid burning bandwidth on full-size uploads
      const thumbUrl = stop.photo_url?.includes('cloudinary.com')
        ? stop.photo_url.replace('/upload/', '/upload/c_fill,w_300,h_100,q_auto,f_auto/')
        : stop.photo_url;

      const popupContent = `
        <div style="min-width:220px;max-width:280px;font-family:sans-serif;">
          <h3 style="font-weight:700;font-size:14px;margin:0 0 4px">${stop.name}</h3>
          ${thumbUrl ? `<img src="${thumbUrl}" loading="lazy" style="width:100%;height:100px;object-fit:cover;border-radius:6px;margin-bottom:6px" />` : ''}
          ${stop.description ? `<p style="font-size:12px;color:#555;margin:0 0 6px">${stop.description}</p>` : ''}
          ${canEdit ? `
            <div style="display:flex;gap:6px;margin-top:6px">
              <button onclick="window.__editStop?.('${stop.id}')" style="flex:1;padding:4px 8px;border:1px solid #2563EB;color:#2563EB;border-radius:6px;font-size:11px;cursor:pointer;background:white">Edit</button>
              <button onclick="window.__deleteStop?.('${stop.id}')" style="flex:1;padding:4px 8px;border:1px solid #EF4444;color:#EF4444;border-radius:6px;font-size:11px;cursor:pointer;background:white">Delete</button>
            </div>
          ` : ''}
          <div id="comments-${stop.id}" style="margin-top:8px;font-size:12px;color:#888">Loading comments...</div>
        </div>
      `;

      marker.bindPopup(popupContent, { maxWidth: 300 });

      marker.on('popupopen', async () => {
        const el = document.getElementById(`comments-${stop.id}`);
        if (!el) return;
        const res = await fetch(`/api/comments?entity_type=stop&entity_id=${stop.id}`);
        const data = await res.json();
        const comments = data.comments || [];
        el.innerHTML = comments.length === 0
          ? '<span>No comments yet.</span>'
          : comments.map((c: any) => `
            <div style="background:#f3f4f6;border-radius:6px;padding:6px;margin-bottom:4px">
              <div style="display:flex;justify-content:space-between">
                <strong>${c.username}</strong>
                <span style="color:#6b7280">&#9650; ${c.upvotes}</span>
              </div>
              <div style="color:#374151;margin-top:2px">${c.body}</div>
            </div>
          `).join('');
      });

      stopLayersRef.current.push(marker);
    });

    // Expose edit/delete handlers globally for popup buttons
    (window as any).__editStop = async (stopId: string) => {
      const name = prompt('New stop name:');
      if (!name) return;
      const res = await fetch(`/api/stops/${stopId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const data = await res.json();
        onStopUpdated(data.stop);
      }
    };

    (window as any).__deleteStop = async (stopId: string) => {
      if (!confirm('Delete this stop?')) return;
      const res = await fetch(`/api/stops/${stopId}`, { method: 'DELETE' });
      if (res.ok) onStopDeleted(stopId);
    };
  }, [stops, user]);

  // Render routes as polylines (from geojson_path or placeholder)
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    const L = require('leaflet');

    routeLayersRef.current.forEach(l => l.remove());
    routeLayersRef.current = [];

    routes.forEach(route => {
      if (!route.geojson_path) return;
      try {
        const geojson = JSON.parse(route.geojson_path);
        const layer = L.geoJSON(geojson, {
          style: { color: route.color_hex || '#FF0000', weight: 4, opacity: 0.8 },
        }).addTo(map);
        layer.on('click', () => onRouteClick(route));
        routeLayersRef.current.push(layer);
      } catch {
        // invalid geojson, skip
      }
    });
  }, [routes]);

  // Render search pin
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    const L = require('leaflet');

    if (searchPinRef.current) {
      searchPinRef.current.remove();
      searchPinRef.current = null;
    }

    if (searchPin) {
      const marker = L.marker([searchPin.lat, searchPin.lng])
        .addTo(map)
        .bindPopup(`<strong>${searchPin.name}</strong>`)
        .openPopup();
      map.setView([searchPin.lat, searchPin.lng], 15);
      searchPinRef.current = marker;
    }
  }, [searchPin]);

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />;
}
