import notices from './content/notices.json'

function fmtDate(s) {
  if (!s) return ''
  return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function Alert({ a }) {
  return (
    <li className={`alert ${a.accessibility ? 'alert-access' : ''}`}>
      <div className="alert-head">
        <span className="tag">{a.routes.concat(a.stationIds.length ? ['station'] : []).join(', ')}</span>
        {a.headline}
      </div>
      <div className="alert-body">{a.description}</div>
      <div className="muted">
        {a.impact}
        {a.start && ` · since ${fmtDate(a.start)}`}
        {a.end && ` · until ${fmtDate(a.end)}`}
        {a.url && (
          <>
            {' · '}
            <a href={a.url} target="_blank" rel="noreferrer">details</a>
          </>
        )}
      </div>
    </li>
  )
}

export default function StatusPanel({ alerts, fetchedAt }) {
  const access = alerts.filter((a) => a.accessibility)
  const service = alerts.filter((a) => !a.accessibility)

  return (
    <div className="panel">
      <section>
        <h3>Local notices</h3>
        <p className="muted">Block parties, street closures and stop closures in the Village, entered by hand.</p>
        {notices.length === 0 ? (
          <p className="empty">No local notices entered yet.</p>
        ) : (
          <ul className="alerts">
            {notices.map((n, i) => (
              <li key={i} className="alert">
                <div className="alert-head">
                  <span className="tag">{n.type}</span>
                  {n.title}
                </div>
                <div className="alert-body">{n.location}</div>
                <div className="muted">
                  {n.dates}
                  {n.source && (
                    <>
                      {' · '}
                      <a href={n.source} target="_blank" rel="noreferrer">source</a>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>CTA elevator alerts ({access.length})</h3>
        {access.length === 0 ? <p className="empty">None on lines serving Oak Park.</p> : <ul className="alerts">{access.map((a) => <Alert key={a.id} a={a} />)}</ul>}
      </section>

      <section>
        <h3>CTA service alerts ({service.length})</h3>
        {service.length === 0 ? <p className="empty">None on routes serving Oak Park.</p> : <ul className="alerts">{service.map((a) => <Alert key={a.id} a={a} />)}</ul>}
      </section>

      <p className="muted small">
        CTA alerts as of {fetchedAt ? new Date(fetchedAt).toLocaleString() : 'unknown'}. They cover whole lines, so some
        may be outside Oak Park. Pace and Metra alerts aren't included yet. Check{' '}
        <a href="https://www.pacebus.com/" target="_blank" rel="noreferrer">Pace</a> and{' '}
        <a href="https://metra.com/train-lines/stations/oak-park" target="_blank" rel="noreferrer">Metra</a>.
      </p>
    </div>
  )
}
