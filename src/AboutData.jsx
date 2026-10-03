export default function AboutData() {
  return (
    <div className="panel">
      <h3>Sources</h3>
      <ul>
        <li>
          Stops: <a href="https://github.com/oak-park-cisc/Oak_Park_Day_in_our_Data/blob/main/data/transit-stops-oak-park.csv" target="_blank" rel="noreferrer">transit-stops-oak-park.csv</a>{' '}
          (Day in Our Data), built from CTA, Pace and Metra GTFS
        </li>
        <li>Route lines: CTA, Pace and Metra GTFS schedule files, clipped to Oak Park</li>
        <li>
          Alerts: <a href="https://www.transitchicago.com/developers/alerts/" target="_blank" rel="noreferrer">CTA Customer Alerts API</a>, refreshed when the site rebuilds
        </li>
      </ul>
      <h3>Limits</h3>
      <ul>
        <li>The stops file is a snapshot, not a live schedule.</li>
        <li>Trip counts are for one weekday (September 9, 2026). They don't tell you how often a bus comes or what runs on Saturdays.</li>
        <li>Pace stop accessibility isn't recorded. "Unknown" doesn't mean inaccessible.</li>
        <li>This page doesn't have live arrivals, span of service, or rider eligibility rules yet.</li>
      </ul>
    </div>
  )
}
