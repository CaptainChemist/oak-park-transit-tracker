import Papa from 'papaparse'

const base = import.meta.env.BASE_URL

export const AGENCY_COLORS = {
  CTA: '#C60C30',
  Pace: '#00539F',
  Metra: '#D97706',
}

// GTFS wheelchair_boarding: 1 = accessible, 2 = not accessible, blank/0 = no information
export const ACCESS = {
  yes: { label: 'Accessible', color: '#15803D' },
  no: { label: 'Not accessible', color: '#B91C1C' },
  unknown: { label: 'Unknown', color: '#6B7280' },
}

export function accessOf(stop) {
  if (stop.wheelchair_boarding === '1') return 'yes'
  if (stop.wheelchair_boarding === '2') return 'no'
  return 'unknown'
}

// Rail line names in the stops CSV -> ids used in CTA alerts
const RAIL_IDS = { 'Green Line': 'G', 'Blue Line': 'Blue' }

export function routeIds(stop) {
  return stop.routes
    .split(';')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => RAIL_IDS[r] ?? r)
}

async function getJson(path) {
  const res = await fetch(base + path)
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.json()
}

export async function loadStops() {
  const res = await fetch(base + 'data/transit-stops-oak-park.csv')
  const text = await res.text()
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true })
  return data.map((s) => ({ ...s, lat: +s.latitude, lon: +s.longitude }))
}

export const loadRoutes = () => getJson('data/routes.geojson')

export const loadBoundary = () => getJson('data/boundary.geojson')

const BUS_PROXY = import.meta.env.VITE_BUS_PROXY_URL

// Live CTA and Pace buses from the Cloudflare Worker (worker/). Falls back to
// a saved sample, clearly flagged, if the proxy or the feeds are down.
export async function loadLiveBuses() {
  try {
    if (!BUS_PROXY) throw new Error('No proxy configured')
    const res = await fetch(`${BUS_PROXY}/vehicles`)
    if (!res.ok) throw new Error(`Proxy ${res.status}`)
    return { ...(await res.json()), live: true }
  } catch (e) {
    const sample = await getJson('data/bus-vehicles-sample.json')
    return { ...sample, live: false, error: e.message }
  }
}

// Stops across Harlem/Austin sit within ~85 m of the Village line; the next
// closest (Lake and Madison in River Forest/Forest Park) are 150 m+ out.
const ACROSS_STREET_M = 100
export const BUS_RANGE_M = 402 // live buses: 1/4 mile, same as the fade for now but tuned separately
export const FADE_M = 402 // 1/4 mile; matches FADE_M in scripts/build_boundary.py

const villageRings = (boundary) => boundary.features.find((f) => f.properties.kind === 'village').geometry.coordinates

// Even-odd ray cast against the Village outline
function insideVillage({ lat, lon }, boundary) {
  let inside = false
  for (const ring of villageRings(boundary)) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j]
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

// Distance in meters from a point to the Village outline (flat-earth, fine at this scale)
function metersToBoundary({ lat, lon }, boundary) {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180)
  const ky = 111320
  const px = lon * kx
  const py = lat * ky
  let best = Infinity
  for (const ring of villageRings(boundary)) {
    for (let i = 1; i < ring.length; i++) {
      const ax = ring[i - 1][0] * kx, ay = ring[i - 1][1] * ky
      const bx = ring[i][0] * kx, by = ring[i][1] * ky
      const dx = bx - ax, dy = by - ay
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
      best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy))
    }
  }
  return best
}

// Meters outside the Village, 0 if inside
export function metersFromVillage(point, boundary) {
  return insideVillage(point, boundary) ? 0 : metersToBoundary(point, boundary)
}

// Inside the Village, or just across a border street from it
export function nearVillage(stop, boundary) {
  if (stop.in_oak_park === 'Y') return true
  return boundary ? metersToBoundary(stop, boundary) <= ACROSS_STREET_M : false
}

export async function loadAlerts() {
  try {
    return await getJson('data/alerts.json')
  } catch {
    return { fetchedAt: null, alerts: [] }
  }
}
