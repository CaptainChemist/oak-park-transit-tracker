import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer } from 'react-leaflet'
import { ACCESS, AGENCY_COLORS, accessOf, routeIds } from './data'

const CENTER = [41.8875, -87.7915]

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

export default function MapView({ stops, routes, alerts, colorBy, showRoutes }) {
  const alertsFor = (stop) =>
    alerts.filter(
      (a) => a.stationIds.includes(stop.stop_id) || (stop.agency === 'CTA' && a.routes.some((r) => routeIds(stop).includes(r))),
    )

  return (
    <MapContainer center={CENTER} zoom={14} className="map" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {showRoutes && routes && <GeoJSON key="routes" data={routes} style={routeStyle} />}
      {stops.map((s) => {
        const rail = s.stop_type === 'rail_station'
        const fill = colorBy === 'access' ? ACCESS[accessOf(s)].color : AGENCY_COLORS[s.agency]
        const stationAlert = alerts.some((a) => a.stationIds.includes(s.stop_id))
        return (
          <CircleMarker
            key={`${s.agency}-${s.stop_id}`}
            center={[s.lat, s.lon]}
            radius={rail ? 9 : 5}
            pathOptions={{
              color: stationAlert ? '#F59E0B' : '#fff',
              weight: stationAlert ? 4 : rail ? 2.5 : 1.5,
              fillColor: fill,
              fillOpacity: 0.95,
            }}
          >
            <Popup>
              <StopPopup stop={s} alerts={alertsFor(s)} />
            </Popup>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
