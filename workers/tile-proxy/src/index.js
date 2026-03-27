export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Max-Age': '86400',
        },
      })
    }

    const url = new URL(request.url)
    // Expect path: /{z}/{x}/{y}
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 3) return new Response('Bad request', { status: 400 })

    const [z, x, y] = parts.slice(-3)
    if (!env.MAPILLARY_TOKEN) return new Response('Not configured', { status: 503 })

    const tileUrl =
      `https://tiles.mapillary.com/maps/vtp/mly1_public/2/${z}/${x}/${y}` +
      `?access_token=${env.MAPILLARY_TOKEN}`

    let res
    try {
      res = await fetch(tileUrl, { signal: AbortSignal.timeout(8000), redirect: 'manual' })
    } catch {
      return new Response('Upstream timeout', { status: 504 })
    }

    // Mapillary redirects (to Meta/Facebook login) when token is used server-side without browser context.
    // Treat any redirect as auth failure.
    if (res.status >= 300 && res.status < 400) return new Response('Auth redirect', { status: 401 })
    if (!res.ok) return new Response(null, { status: res.status })

    const buf = await res.arrayBuffer()
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/x-protobuf',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'Access-Control-Allow-Origin': '*',
      },
    })
  },
}
