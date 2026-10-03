import providers from './content/providers.json'

export default function ProviderGuide() {
  return (
    <div className="panel">
      <p className="muted">Who runs transportation in Oak Park, who can ride, and where to find official information.</p>
      <ul className="providers">
        {providers.map((p) => (
          <li key={p.id} className="provider">
            <div className="provider-head">
              <strong>{p.provider}</strong>
              {!p.verified && <span className="tag tag-warn">unverified</span>}
            </div>
            <div><b>Serves:</b> {p.serves}</div>
            <div><b>Who can ride:</b> {p.who}</div>
            {p.phone && <div><b>Phone:</b> <a href={`tel:${p.phone.replace(/\D/g, '')}`}>{p.phone}</a></div>}
            {p.notes && <div className="muted">{p.notes}</div>}
            <div className="links">
              {p.links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>
              ))}
            </div>
            {p.checkedOn && <div className="muted small">Checked {p.checkedOn}</div>}
          </li>
        ))}
      </ul>
    </div>
  )
}
