import L from 'leaflet'
import { Marker, Pane, Polyline, Rectangle, useMapEvents } from 'react-leaflet'
import { routeColor } from './data'
import { band } from './travel'
import { HEAT } from './TravelPanel'

const pinIcon = (which) =>
  L.divIcon({
    className: '',
    html: `<div class="travel-pin pin-${which}">${which === 'start' ? 'A' : 'B'}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
const ICONS = { start: pinIcon('start'), end: pinIcon('end') }

// Cell edges from a center: half a cell each way in degrees, 3% oversized so
// neighbors overlap instead of leaving hairline seams from rounding
const halfLat = (m) => (m * 0.515) / 111320
const halfLon = (m, lat) => (m * 0.515) / (111320 * Math.cos((lat * Math.PI) / 180))

function Clicks({ placing, onPlace }) {
  useMapEvents({ click: (e) => placing && onPlace(placing, [e.latlng.lat, e.latlng.lng]) })
  return null
}

export default function TravelLayer({ cells, cellM, minutes, start, end, placing, onPlace, result, palette }) {
  return (
    <>
      <Clicks placing={placing} onPlace={onPlace} />
      {/* Over the basemap (200), under route lines (400) so streets and lines stay readable */}
      <Pane name="heat" style={{ zIndex: 300 }}>
        {minutes &&
          cells.map(([lat, lon], i) => (
            <Rectangle
              key={i}
              bounds={[
                [lat - halfLat(cellM), lon - halfLon(cellM, lat)],
                [lat + halfLat(cellM), lon + halfLon(cellM, lat)],
              ]}
              pathOptions={{ stroke: false, fillColor: HEAT[band(minutes[i])], fillOpacity: 0.55 }}
              interactive={false}
            />
          ))}
      </Pane>
      {/* The trip: walks dashed, rides in the route's color, over everything but icons */}
      <Pane name="trip" style={{ zIndex: 470 }}>
        {result?.legs.map((l, i) =>
          l.kind === 'wait' ? null : (
            <Polyline
              key={i}
              positions={l.path}
              interactive={false}
              pathOptions={
                l.kind === 'walk'
                  ? { color: palette.boundary, weight: 3, dashArray: '2 7', lineCap: 'round' }
                  : { color: routeColor(l.route, palette), weight: 7, opacity: 0.95, lineCap: 'round' }
              }
            />
          ),
        )}
      </Pane>
      {['start', 'end'].map(
        (k) =>
          (k === 'start' ? start : end) && (
            <Marker
              key={k}
              position={k === 'start' ? start : end}
              icon={ICONS[k]}
              draggable
              zIndexOffset={2000}
              eventHandlers={{ dragend: (e) => onPlace(k, [e.target.getLatLng().lat, e.target.getLatLng().lng]) }}
            />
          ),
      )}
    </>
  )
}
