// Cloudflare Worker: CORS proxy for live Pace bus positions on Oak Park routes.
//
// GET /vehicles -> { fetchedAt, vehicles: [{ route, routeName, lat, lon, heading, id }] }
//
// Pace has no official real-time API. This calls the undocumented JSON behind
// the TMWebWatch live map, so it may break without notice. Only the Oak Park
// routes below can be requested, so this isn't an open proxy.

const PACE = 'https://tmweb.pacebus.com/TMWebWatch/GoogleMap.aspx/getVehicles'

// Pace route number -> TMWebWatch routeID
const ROUTES = { 307: 33, 309: 35, 311: 37, 313: 38, 314: 271, 315: 39, 318: 41 }

const ALLOWED_ORIGINS = [
  'https://captainchemist.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
]

const CACHE_SECONDS = 20

function cors(request) {
  const origin = request.headers.get('Origin')
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
  }
}

async function fetchRoute(routeNumber, routeID) {
  const res = await fetch(PACE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ routeID }),
  })
  if (!res.ok) throw new Error(`Pace ${routeNumber}: ${res.status}`)
  const { d } = await res.json()
  return (d || []).map((v) => ({
    route: String(routeNumber),
    routeName: v.routeName,
    lat: v.lat,
    lon: v.lon,
    heading: v.heading,
    id: v.propertyTag,
  }))
}

async function vehicles() {
  const results = await Promise.allSettled(Object.entries(ROUTES).map(([n, id]) => fetchRoute(n, id)))
  const ok = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value)
  const errors = results.filter((r) => r.status === 'rejected').map((r) => r.reason.message)
  if (ok.length === 0 && errors.length) throw new Error(errors.join('; '))
  return { fetchedAt: new Date().toISOString(), vehicles: ok, errors }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(request) })
    if (url.pathname !== '/vehicles') return new Response('Not found', { status: 404 })

    // Share one upstream fetch across all viewers for CACHE_SECONDS
    const cache = caches.default
    const key = new Request(url.origin + '/vehicles')
    let res = await cache.match(key)
    if (!res) {
      try {
        res = new Response(JSON.stringify(await vehicles()), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_SECONDS}` },
        })
        ctx.waitUntil(cache.put(key, res.clone()))
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', ...cors(request) },
        })
      }
    }
    res = new Response(res.body, res)
    for (const [k, v] of Object.entries(cors(request))) res.headers.set(k, v)
    return res
  },
}
