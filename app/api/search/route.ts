import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q');
  if (!q) return NextResponse.json({ results: [] });

  const geoapifyKey = process.env.GEOAPIFY_KEY;

  // Try Geoapify first
  if (geoapifyKey) {
    try {
      const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(q)}&filter=countrycode:ph&limit=5&apiKey=${geoapifyKey}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.features?.length > 0) {
        const results = data.features.map((f: any) => ({
          name: f.properties.formatted,
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
        }));
        return NextResponse.json({ results });
      }
    } catch {
      // fall through to Nominatim
    }
  }

  // Fallback: Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=ph&limit=5`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Sakayan/1.0' } });
    const data = await res.json();
    const results = data.map((r: any) => ({
      name: r.display_name,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    }));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
