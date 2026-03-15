'use client';
import { useState, useEffect } from 'react';
import CommentsSection from './CommentsSection';

interface Props {
  route: any;
  user: any;
  onClose: () => void;
  onEdit: (route: any) => void;
  onDelete: (routeId: string) => void;
  onLoginRequired: () => void;
}

export default function RoutePanel({ route, user, onClose, onEdit, onDelete, onLoginRequired }: Props) {
  const [stops, setStops] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/routes/${route.id}/stops`)
      .then(r => r.json())
      .then(d => setStops(d.stops || []));
  }, [route.id]);

  const canEdit = user && (user.id === route.created_by || user.role === 'admin');

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-white shadow-2xl z-[1000] flex flex-col overflow-hidden">
      <div className="flex justify-between items-center p-4 border-b" style={{ borderLeftColor: route.color_hex, borderLeftWidth: 4 }}>
        <div>
          <h2 className="font-bold text-lg">{route.name}</h2>
          <span className="text-xs text-gray-500 capitalize">{route.type.replace('_', ' ')}</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-sm font-semibold text-gray-600 mb-2">Stops ({stops.length})</h3>
        <div className="space-y-1 mb-4">
          {stops.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 text-sm">
              <span className="w-5 h-5 rounded-full bg-gray-200 text-xs flex items-center justify-center font-medium">{i + 1}</span>
              <span>{s.name}</span>
            </div>
          ))}
          {stops.length === 0 && <p className="text-xs text-gray-400">No stops added yet.</p>}
        </div>
        {canEdit && (
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => onEdit(route)}
              className="flex-1 border border-blue-600 text-blue-600 rounded py-1 text-xs hover:bg-blue-50"
            >
              Edit Route
            </button>
            {user.role === 'admin' && (
              <button
                onClick={() => onDelete(route.id)}
                className="flex-1 border border-red-500 text-red-500 rounded py-1 text-xs hover:bg-red-50"
              >
                Delete
              </button>
            )}
          </div>
        )}
        <CommentsSection
          entityType="route"
          entityId={route.id}
          user={user}
          onLoginRequired={onLoginRequired}
        />
      </div>
    </div>
  );
}
