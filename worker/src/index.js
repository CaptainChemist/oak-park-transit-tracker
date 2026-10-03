// Cloudflare Worker: CORS proxy for live bus positions on Oak Park routes.
//
// GET /vehicles -> { fetchedAt, vehicles: [{ agency, route, routeName, lat, lon, heading, id }], errors }
//
// Pace has no official real-time API. This calls the undocumented JSON behind
// the TMWebWatch live map, so it may break without notice.
// CTA uses the Bus Tracker API with the CTA_BUS_KEY secret
// (`npx wrangler secret put CTA_BUS_KEY`), which never reaches the browser.
// Only the Oak Park routes below can be requested, so this isn't an open proxy.

const PACE = 'https://tmweb.pacebus.com/TMWebWatch/GoogleMap.aspx/getVehicles'

// Pace route number -> TMWebWatch routeID
const ROUTES = { 307: 33, 309: 35, 311: 37, 313: 38, 314: 271, 315: 39, 318: 41 }

const CTA = 'https://www.ctabustracker.com/bustime/api/v2/getvehicles'
const CTA_ROUTES = ['20', '66', '70', '86', '90', '91', '126'] // max 10 per request

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
    agency: 'Pace',
    route: String(routeNumber),
    routeName: v.routeName,
    lat: v.lat,
    lon: v.lon,
    heading: v.heading,
    id: v.propertyTag,
  }))
}

async function fetchCta(key) {
  if (!key) throw new Error('CTA: no CTA_BUS_KEY secret')
  const url = `${CTA}?key=${encodeURIComponent(key)}&rt=${CTA_ROUTES.join(',')}&format=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`CTA: ${res.status}`)
  const body = (await res.json())['bustime-response'] || {}
  // "No data found" just means a route has no buses out right now
  const fatal = (body.error || []).filter((e) => !/no data found/i.test(e.msg))
  if (!body.vehicle && fatal.length) throw new Error(`CTA: ${fatal.map((e) => e.msg).join('; ')}`)
  return (body.vehicle || []).map((v) => ({
    agency: 'CTA',
    route: v.rt,
    routeName: `to ${v.des}`,
    lat: +v.lat,
    lon: +v.lon,
    heading: +v.hdg,
    id: v.vid,
    delayed: v.dly,
  }))
}

async function vehicles(env) {
  const results = await Promise.allSettled([
    ...Object.entries(ROUTES).map(([n, id]) => fetchRoute(n, id)),
    fetchCta(env.CTA_BUS_KEY),
  ])
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
        res = new Response(JSON.stringify(await vehicles(env)), {
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
