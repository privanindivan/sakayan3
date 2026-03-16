// Shared in-memory cache for the routes list
// Exported so both route.ts (list) and [id]/route.ts (mutations) can bust it
export let routesCache: { data: any[]; ts: number } | null = null;
export const CACHE_TTL_MS = 30_000;

export function setRoutesCache(data: any[]) {
  routesCache = { data, ts: Date.now() };
}

export function bustRoutesCache() {
  routesCache = null;
}
