import { routeColor } from './data'
import { DAYS } from './RoutesPanel'
import { BANDS } from './travel'

// Viridis: perceptually even and colorblind-safe; bright = quick, dark = slow
export const HEAT = ['#FDE725', '#90D743', '#35B779', '#21918C', '#31688E', '#443983', '#440154']

const clock = (m) => {
  const h = Math.floor(m / 60) % 24
  const mm = String(Math.floor(m % 60)).padStart(2, '0')
  return `${h % 12 || 12}:${mm} ${h < 12 ? 'a.m.' : 'p.m.'}`
}
const mins = (m) => `${Math.max(1, Math.round(m))} min`

function Legend() {
  const labels = [...BANDS.map((b, i) => `${i ? BANDS[i - 1] : 0}–${b}`), `${BANDS.at(-1)}+`]
  return (
    <div className="heat-legend" aria-label="Minutes">
      {labels.map((l, i) => (
        <span key={l}>
          <i style={{ background: HEAT[i] }} />
          {l}
        </span>
      ))}
      <span className="muted small">minutes</span>
    </div>
  )
}

function Legs({ result, palette }) {
  return (
    <ol className="legs">
      {result.legs.map((l, i) => (
        <li key={i}>
          {l.kind === 'walk' && <>Walk {mins(l.min)}</>}
          {l.kind === 'wait' && <span className="muted">Wait {mins(l.min)}</span>}
          {l.kind === 'ride' && (
            <>
              <span
                className="route-tag route-badge"
                style={{ background: routeColor(l.route, palette), borderColor: routeColor(l.route, palette), color: 'var(--on-marker)' }}
              >
                {l.route.split(':')[1]}
              </span>{' '}
              {clock(l.depart)} · {l.stops} {l.stops === 1 ? 'stop' : 'stops'} · {mins(l.min)}
            </>
          )}
        </li>
      ))}
    </ol>
  )
}

export default function TravelPanel({ ready, placing, setPlacing, start, end, clear, day, setDay, time, setTime, result, ms, palette }) {
  const mode = start && end ? 'trip' : start ? 'from' : end ? 'to' : null
  return (
    <div className="panel travel">
      <p className="muted">
        Drop a start pin to see how long it takes to get everywhere in Oak Park, an end pin to see how long it takes to get there
        from everywhere, or both for the fastest trip. Walking, waiting and riding are all included.
      </p>
      <div className="travel-pins">
        <button type="button" className="chip" aria-pressed={placing === 'start'} onClick={() => setPlacing(placing === 'start' ? null : 'start')}>
          <i className="pin-dot pin-start" /> {start ? 'Move start' : 'Set start'}
        </button>
        <button type="button" className="chip" aria-pressed={placing === 'end'} onClick={() => setPlacing(placing === 'end' ? null : 'end')}>
          <i className="pin-dot pin-end" /> {end ? 'Move end' : 'Set end'}
        </button>
        {(start || end) && (
          <button type="button" className="chip" onClick={clear}>
            Clear
          </button>
        )}
      </div>
      {placing && <p className="travel-hint">Click the map to place the {placing} pin. You can drag pins afterward.</p>}

      <div className="travel-when">
        <label>
          <span className="muted small">Day</span>
          <select value={day} onChange={(e) => setDay(e.target.value)}>
            {Object.entries(DAYS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted small">Leaving at</span>
          <input type="time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
        </label>
      </div>

      {!ready && <p className="empty">Loading schedules…</p>}

      {ready && mode === 'from' && (
        <section>
          <h3>Minutes from the start pin</h3>
          <Legend />
        </section>
      )}
      {ready && mode === 'to' && (
        <section>
          <h3>Minutes to the end pin</h3>
          <Legend />
        </section>
      )}
      {ready && mode === 'trip' && result && (
        <section>
          <h3>
            {mins(result.minutes)}
            {result.legs.some((l) => l.kind === 'ride') ? ' by transit' : ' walking'}
          </h3>
          {result.legs.some((l) => l.kind === 'ride') ? (
            <p className="muted small">Walking the whole way: {mins(result.walkOnly)}</p>
          ) : (
            <p className="muted small">Walking is fastest for this trip.</p>
          )}
          <Legs result={result} palette={palette} />
        </section>
      )}
      {ready && ms != null && <p className="muted small">Calculated in {Math.max(1, Math.round(ms))} ms on this device.</p>}

      <p className="muted small route-note">
        An estimate from the {DAYS[day].toLowerCase()} schedule, leaving over the next half hour (the map shows the middle result). Walking is
        about 3 mph along the street grid and doesn't know where to cross the Eisenhower. Live delays aren't included.
      </p>
    </div>
  )
}
