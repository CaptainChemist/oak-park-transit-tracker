import L from 'leaflet'
import { CircleMarker, GeoJSON, MapContainer, Marker, Pane, Polyline, Popup, TileLayer } from 'react-leaflet'
import { ACCESS, AGENCY_COLORS, accessOf, routeIds } from './data'
import { ARROW_SVG, BUS_SVG, TRAIN_SVG } from './icons'
import { TRAIL_MINUTES } from './trails'

const CENTER = [41.8875, -87.7915]

// Reuse icon objects so Leaflet only swaps a bus's DOM element when its route or
// heading changes. A fresh icon every render replaced the element under the
// cursor, which could eat clicks and stopped the glide transition.
const busIcons = new Map()

function busIcon(v, live) {
  const color = live ? AGENCY_COLORS[v.agency] : '#9CA3AF'
  const heading = Math.round(v.heading / 15) * 15
  const key = `${color}|${v.route}|${heading}`
  if (!busIcons.has(key)) {
    busIcons.set(
      key,
      L.divIcon({
        className: 'bus-marker',
        html: `<div class="bus" style="background:${color}">${BUS_SVG}<span>${v.route}</span><i class="bus-dir" style="transform: rotate(${heading}deg)">${ARROW_SVG}</i></div>`,
        iconSize: [56, 22],
        iconAnchor: [28, 11],
      }),
    )
  }
  return busIcons.get(key)
}

function stationIcon(fill, alert) {
  return L.divIcon({
    className: '',
    html: `<div class="station ${alert ? 'station-alert' : ''}" style="background:${fill}">${TRAIN_SVG}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

const BOUNDARY_COLOR = '#374151' // neutral, so it doesn't read as a Pace route
const FADE_COLOR = '#f7f7f5' // matches --bg in index.css
const FADE_MAX = 1 // basemap opacity hidden past 1/4 mile; lower to keep faint streets

// Fade masks are stacked, each covering everything past its distance from the
// Village line. Pick each mask's opacity so the stack ramps linearly to FADE_MAX.
function fadeStyle(feature, steps) {
  const k = feature.properties.step
  const cover = (i) => (i < 0 ? 0 : (FADE_MAX * (i + 1)) / steps)
  return {
    stroke: false,
    fillColor: FADE_COLOR,
    fillOpacity: 1 - (1 - cover(k)) / (1 - cover(k - 1)),
  }
}

function Boundary({ data, fade }) {
  const fades = { ...data, features: data.features.filter((f) => f.properties.kind === 'fade') }
  const village = { ...data, features: data.features.filter((f) => f.properties.kind === 'village') }
  return (
    <>
      {/* Above the basemap tiles (200), below routes and stops (400) */}
      <Pane name="fade" style={{ zIndex: 250 }}>
        {fade && <GeoJSON data={fades} style={(f) => fadeStyle(f, fades.features.length)} interactive={false} />}
      </Pane>
      {/* Above routes (400) so Harlem/Austin bus lines don't hide it; below bus stops (460) and icons (600) */}
      <Pane name="boundary" style={{ zIndex: 450 }}>
        <GeoJSON data={village} style={{ color: BOUNDARY_COLOR, weight: 3, dashArray: '10 6', fill: false }} interactive={false} />
      </Pane>
    </>
  )
}

function routeStyle(feature) {
  const p = feature.properties
  const rail = p.type !== 3 // GTFS route_type 3 = bus
  return {
    color: rail ? p.color : AGENCY_COLORS[p.agency],
    weight: rail ? 5 : 2.5,
    opacity: rail ? 0.9 : 0.45,
  }
}

function StopPopup({ stop, alerts }) {
  const access = ACCESS[accessOf(stop)]
  return (
    <div className="popup">
      <strong>{stop.stop_name}</strong>
      <div className="popup-agency" style={{ color: AGENCY_COLORS[stop.agency] }}>
        {stop.agency} {stop.stop_type === 'rail_station' ? 'station' : 'bus stop'}
        {stop.in_oak_park === 'N' && ' · just outside the Village'}
      </div>
      <div>
        <b>Routes:</b> {stop.routes.split(';').join(', ')}
        {stop.route_names && stop.route_names !== stop.routes && <> ({stop.route_names.split(';').join(', ')})</>}
      </div>
      <div>
        <b>Wheelchair boarding:</b>{' '}
        <span className="access-pill" style={{ background: access.color }}>{access.label}</span>
      </div>
      {stop.weekday_trips && (
        <div className="muted">
          {stop.weekday_trips} trips on {stop.weekday_date} (one weekday, not a headway)
        </div>
      )}
      {alerts.length > 0 && (
        <div className="popup-alerts">
          <b>⚠ {alerts.length} active alert{alerts.length > 1 ? 's' : ''}</b>
          <ul>
            {alerts.slice(0, 3).map((a) => (
              <li key={a.id}>{a.headline}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// One segment per hop so older parts of the trail fade out
function Trail({ points, color, now }) {
  const maxAge = TRAIL_MINUTES * 60_000
  return points.slice(1).map((p, i) => {
    const prev = points[i]
    const fresh = Math.max(0, 1 - (now - p.t) / maxAge)
    return (
      <Polyline
        key={p.t}
        positions={[[prev.lat, prev.lon], [p.lat, p.lon]]}
        pathOptions={{ color, weight: 4, opacity: 0.15 + 0.7 * fresh, lineCap: 'round', interactive: false }}
      />
    )
  })
}

export default function MapView({ stops, routes, boundary, fade, alerts, colorBy, showRoutes, buses, trails }) {
  const alertsFor = (stop) =>
    alerts.filter(
      (a) => a.stationIds.includes(stop.stop_id) || (stop.agency === 'CTA' && a.routes.some((r) => routeIds(stop).includes(r))),
    )
  const now = Date.now()
  const fillFor = (s) => (colorBy === 'access' ? ACCESS[accessOf(s)].color : AGENCY_COLORS[s.agency])

  return (
    <MapContainer center={CENTER} zoom={14} className="map" scrollWheelZoom preferCanvas>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {boundary && <Boundary data={boundary} fade={fade} />}
      {showRoutes && routes && <GeoJSON key="routes" data={routes} style={routeStyle} />}

      {/* Own pane so bus stops draw over the Village line (450) but under station/bus icons (600) */}
      <Pane name="stops" style={{ zIndex: 460 }}>
        {stops
          .filter((s) => s.stop_type !== 'rail_station')
          .map((s) => (
            <CircleMarker
              key={`${s.agency}-${s.stop_id}`}
              center={[s.lat, s.lon]}
              radius={4.5}
              pathOptions={{ color: '#fff', weight: 1.5, fillColor: fillFor(s), fillOpacity: 0.95 }}
            >
              <Popup>
                <StopPopup stop={s} alerts={alertsFor(s)} />
              </Popup>
            </CircleMarker>
          ))}
      </Pane>

      {buses &&
        trails &&
        buses.vehicles.map((v) => {
          const key = `${v.agency}-${v.id}`
          return trails[key]?.length > 1 && <Trail key={`trail-${key}`} points={trails[key]} color={AGENCY_COLORS[v.agency]} now={now} />
        })}

      {stops
        .filter((s) => s.stop_type === 'rail_station')
        .map((s) => (
          <Marker
            key={`${s.agency}-${s.stop_id}`}
            position={[s.lat, s.lon]}
            icon={stationIcon(fillFor(s), alerts.some((a) => a.stationIds.includes(s.stop_id)))}
            zIndexOffset={500}
          >
            <Popup>
              <StopPopup stop={s} alerts={alertsFor(s)} />
            </Popup>
          </Marker>
        ))}

      {buses?.vehicles?.map((v) => (
        <Marker key={`${v.agency}-${v.id}`} position={[v.lat, v.lon]} icon={busIcon(v, buses.live)} zIndexOffset={1000}>
          <Popup>
            <div className="popup">
              <strong>{v.agency} {v.route} {v.routeName}</strong>
              <div>Bus #{v.id}{v.delayed && <b> · delayed</b>}</div>
              <div className="muted">
                {buses.live ? 'Live position' : 'Saved sample, not live'} as of {new Date(buses.fetchedAt).toLocaleTimeString()}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
