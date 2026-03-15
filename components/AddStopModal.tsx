'use client';
import { useState } from 'react';

interface Props {
  lat: number;
  lng: number;
  routes: any[];
  onClose: () => void;
  onSave: (stop: any) => void;
}

export default function AddStopModal({ lat, lng, routes, onClose, onSave }: Props) {
  const [form, setForm] = useState({ name: '', description: '', route_id: '', photo_url: '' });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.url) setForm(f => ({ ...f, photo_url: data.url }));
    setUploading(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    const res = await fetch('/api/stops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, lat, lng, route_id: form.route_id || null }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Error'); setSaving(false); return; }
    onSave(data.stop);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">Add Stop</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <p className="text-xs text-gray-500 mb-3">Location: {lat.toFixed(5)}, {lng.toFixed(5)}</p>
        <form onSubmit={save} className="space-y-3">
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Stop name *"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            required
          />
          <textarea
            className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
            placeholder="Description (optional)"
            rows={2}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={form.route_id}
            onChange={e => setForm(f => ({ ...f, route_id: e.target.value }))}
          >
            <option value="">No route (standalone stop)</option>
            {routes.map(r => (
              <option key={r.id} value={r.id}>{r.name} ({r.type})</option>
            ))}
          </select>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Photo (optional)</label>
            <input type="file" accept="image/*" onChange={handleFileUpload} className="text-xs" />
            {uploading && <p className="text-xs text-blue-500 mt-1">Uploading...</p>}
            {form.photo_url && <img src={form.photo_url} alt="" className="mt-2 h-20 rounded object-cover" />}
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={saving || uploading}
            className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Add Stop'}
          </button>
        </form>
      </div>
    </div>
  );
}
