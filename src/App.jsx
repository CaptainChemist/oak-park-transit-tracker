import { useEffect, useMemo, useState } from 'react'
import AboutData from './AboutData'
import { ACCESS, AGENCY_COLORS, loadAlerts, loadBoundary, loadLiveBuses, loadRoutes, loadStops, nearVillage } from './data'
import MapView from './MapView'
import ProviderGuide from './ProviderGuide'
import StatusPanel from './StatusPanel'
import { BUS_SVG, TRAIN_SVG } from './icons'
import { addSnapshot, loadTrails } from './trails'

const BUS_POLL_MS = 30000

const TABS = { status: 'Status', providers: 'Providers', about: 'About the data' }

export default function App() {
  const [stops, setStops] = useState([])
  const [routes, setRoutes] = useState(null)
  const [boundary, setBoundary] = useState(null)
  const [alertData, setAlertData] = useState({ fetchedAt: null, alerts: [] })
  const [error, setError] = useState(null)

  const [tab, setTab] = useState('status')
  const [colorBy, setColorBy] = useState('agency')
  const [agencies, setAgencies] = useState({ CTA: true, Pace: true, Metra: true })
  const [villageOnly, setVillageOnly] = useState(false)
  const [showRoutes, setShowRoutes] = useState(true)
  const [showBuses, setShowBuses] = useState(true)
  const [buses, setBuses] = useState(null)
  const [showTrails, setShowTrails] = useState(true)
  const [trails, setTrails] = useState(loadTrails)
  const busesOn = showBuses && (agencies.CTA || agencies.Pace)

  useEffect(() => {
    if (!busesOn) return
    let cancelled = false
    const tick = () =>
      loadLiveBuses().then((b) => {
        if (cancelled) return
        setBuses(b)
        if (b.live) setTrails((t) => addSnapshot(t, b.vehicles, b.fetchedAt))
      })
    tick()
    const id = setInterval(tick, BUS_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [busesOn])

  const visibleBuses = useMemo(
    () => (busesOn && buses ? { ...buses, vehicles: buses.vehicles.filter((v) => agencies[v.agency]) } : null),
    [busesOn, buses, agencies],
  )

  useEffect(() => {
    Promise.all([loadStops(), loadRoutes(), loadBoundary(), loadAlerts()])
      .then(([s, r, b, a]) => {
        setStops(s.map((stop) => ({ ...stop, nearVillage: nearVillage(stop, b) })))
        setRoutes(r)
        setBoundary(b)
        setAlertData(a)
      })
      .catch((e) => setError(e.message))
  }, [])

  const visibleStops = useMemo(
    () => stops.filter((s) => agencies[s.agency] && (!villageOnly || s.nearVillage)),
    [stops, agencies, villageOnly],
  )
  const visibleRoutes = useMemo(
    () => routes && { ...routes, features: routes.features.filter((f) => agencies[f.properties.agency]) },
    [routes, agencies],
  )

  const legend = colorBy === 'agency' ? AGENCY_COLORS : Object.fromEntries(Object.values(ACCESS).map((a) => [a.label, a.color]))

  return (
    <div className="app">
      <header>
        <h1>Oak Park Transit</h1>
        <p>Stops, routes, accessibility and service status for CTA, Pace and Metra in Oak Park</p>
      </header>

      <main>
        <div className="map-wrap">
          <div className="controls">
            <div className="control-group">
              {Object.keys(agencies).map((a) => (
                <label key={a}>
                  <input type="checkbox" checked={agencies[a]} onChange={(e) => setAgencies({ ...agencies, [a]: e.target.checked })} />
                  {a}
                </label>
              ))}
            </div>
            <div className="control-group">
              <label>
                <input type="checkbox" checked={villageOnly} onChange={(e) => setVillageOnly(e.target.checked)} />
                Inside Village only
              </label>
              <label>
                <input type="checkbox" checked={showRoutes} onChange={(e) => setShowRoutes(e.target.checked)} />
                Routes
              </label>
              <label>
                <input type="checkbox" checked={showBuses} onChange={(e) => setShowBuses(e.target.checked)} />
                Live buses
              </label>
              <label>
                <input type="checkbox" checked={showTrails} disabled={!showBuses} onChange={(e) => setShowTrails(e.target.checked)} />
                Trails
              </label>
            </div>
            <div className="control-group segmented">
              <button className={colorBy === 'agency' ? 'on' : ''} onClick={() => setColorBy('agency')}>Color by provider</button>
              <button className={colorBy === 'access' ? 'on' : ''} onClick={() => setColorBy('access')}>Color by accessibility</button>
            </div>
          </div>

          {error ? (
            <div className="error">Couldn't load data: {error}</div>
          ) : (
            <MapView
              stops={visibleStops}
              routes={visibleRoutes}
              boundary={boundary}
              fade={villageOnly}
              alerts={alertData.alerts}
              colorBy={colorBy}
              showRoutes={showRoutes}
              buses={visibleBuses}
              trails={showTrails && visibleBuses?.live ? trails : null}
            />
          )}

          <div className="legend">
            {Object.entries(legend).map(([label, color]) => (
              <span key={label}>
                <i style={{ background: color }} />
                {label}
              </span>
            ))}
            <span>
              <i className="dot" />
              Bus stop
            </span>
            <span>
              <b className="legend-station" dangerouslySetInnerHTML={{ __html: TRAIN_SVG }} />
              Rail station
            </span>
            <span>
              <b className="legend-bus" dangerouslySetInnerHTML={{ __html: BUS_SVG }} />
              Live bus
            </span>
            <span>
              <i className="ring" />
              Station with alert
            </span>
            <span className="muted">{visibleStops.length} stops shown</span>
            {visibleBuses && (
              <span className={visibleBuses.live ? 'live' : 'stale'}>
                {visibleBuses.live
                  ? `● ${visibleBuses.vehicles.length} buses live, updated ${new Date(visibleBuses.fetchedAt).toLocaleTimeString()}`
                  : `Live bus feed unavailable. Showing a saved sample from ${new Date(visibleBuses.fetchedAt).toLocaleTimeString()}`}
              </span>
            )}
          </div>
        </div>

        <aside>
          <nav className="tabs">
            {Object.entries(TABS).map(([k, label]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {label}
                {k === 'status' && alertData.alerts.length > 0 && <span className="badge">{alertData.alerts.length}</span>}
              </button>
            ))}
          </nav>
          {tab === 'status' && <StatusPanel alerts={alertData.alerts} fetchedAt={alertData.fetchedAt} />}
          {tab === 'providers' && <ProviderGuide />}
          {tab === 'about' && <AboutData />}
        </aside>
      </main>
    </div>
  )
}
