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

export async function loadAlerts() {
  try {
    return await getJson('data/alerts.json')
  } catch {
    return { fetchedAt: null, alerts: [] }
  }
}
