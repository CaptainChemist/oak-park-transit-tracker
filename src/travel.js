// Travel-time estimates for the Travel tab, computed in the browser from
// public/data/travel.json (scripts/build_travel.py). A small RAPTOR: walk to
// nearby stops, ride up to two vehicles with a walking transfer between, walk
// to the destination. Times are minutes since midnight of the service day.

const WALK_M_PER_MIN = 78 // 1.3 m/s, about 3 mph
const ACCESS_M = 1200 // longest walk to or from a stop (~15 min)
const TRANSFER_M = 400 // longest walk between stops when transferring
// Up to three vehicles: e.g. 86 down Ridgeland, Green Line to Austin, 91 south.
// Oak Park's routes are short straight lines, so corner-to-corner trips need it.
const RIDES = 3
const KY = 111320
const KX = 111320 * Math.cos((41.887 * Math.PI) / 180)
const INF = 1e9

// Oak Park streets are a north-south/east-west grid, so walking distance is
// closer to |dx| + |dy| than to a straight line
const xy = ([lat, lon]) => [lon * KX, lat * KY]
const walkMin = (a, b) => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])) / WALK_M_PER_MIN
const meters = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])

export function prepare(data) {
  const stops = data.stops.map(xy)
  const near = (p, max) => {
    const out = []
    stops.forEach((s, i) => meters(p, s) <= max && out.push([i, walkMin(p, s)]))
    return out
  }
  const cells = data.cells.map(xy)
  return {
    raw: data,
    stops,
    cells,
    transfers: stops.map((s, i) => near(s, TRANSFER_M).filter(([j]) => j !== i)),
    cellStops: cells.map((c) => near(c, ACCESS_M)),
    near,
  }
}

// First trip in a pattern leaving stop column i at or after time t (trips are sorted)
function firstTrip(rows, i, t) {
  let lo = 0
  let hi = rows.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (rows[mid][i] < t) lo = mid + 1
    else hi = mid
  }
  return lo < rows.length ? lo : -1
}

// Earliest arrival at every stop leaving point p (meters) at time t0
function raptor(net, day, p, t0) {
  const n = net.stops.length
  const best = new Float64Array(n).fill(INF)
  const prev = Array.from({ length: n })
  for (const [s, w] of net.near(p, ACCESS_M)) {
    best[s] = t0 + w
    prev[s] = { kind: 'access', walk: w }
  }
  const patterns = net.raw.days[day] || []
  for (let k = 0; k < RIDES; k++) {
    const from = best.slice()
    const improved = []
    for (const pat of patterns) {
      let trip = -1
      let boardAt = -1
      for (let i = 0; i < pat.s.length; i++) {
        const s = pat.s[i]
        if (trip >= 0) {
          const t = pat.t[trip][i]
          if (t < best[s]) {
            best[s] = t
            prev[s] = { kind: 'ride', pat, trip, board: boardAt, alight: i, fromStop: pat.s[boardAt] }
            improved.push(s)
          }
        }
        if (from[s] < INF && (trip < 0 || from[s] < pat.t[trip][i])) {
          const j = firstTrip(pat.t, i, from[s])
          if (j >= 0 && (trip < 0 || j < trip)) {
            trip = j
            boardAt = i
          }
        }
      }
    }
    if (!improved.length) break
    for (const s of improved) {
      for (const [u, w] of net.transfers[s]) {
        if (best[s] + w < best[u]) {
          best[u] = best[s] + w
          prev[u] = { kind: 'transfer', fromStop: s, walk: w }
        }
      }
    }
  }
  return { best, prev }
}

// Minutes from point p to point q leaving at t0, given a finished raptor()
function arriveAt(net, r, p, q, t0, egress = net.near(q, ACCESS_M)) {
  let best = t0 + walkMin(p, q)
  let via = -1
  for (const [s, w] of egress) {
    if (r.best[s] + w < best) {
      best = r.best[s] + w
      via = s
    }
  }
  return { minutes: best - t0, via }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[s.length >> 1]
}

// Leaving every 5 min over the next half hour, so one lucky or unlucky
// connection doesn't decide the map
const SAMPLES = [0, 5, 10, 15, 20, 25, 30]

// Each heat map returns { minutes, walk }: best time per cell (transit or
// walking) and the walk-only time, so the map can also show time saved

// (1) Start pin: minutes from `start` to every cell
export function fromStart(net, day, start, t0) {
  const p = xy(start)
  const runs = SAMPLES.map((d) => raptor(net, day, p, t0 + d))
  return {
    minutes: net.cells.map((c, i) => median(runs.map((r, k) => arriveAt(net, r, p, c, t0 + SAMPLES[k], net.cellStops[i]).minutes))),
    walk: net.cells.map((c) => walkMin(p, c)),
  }
}

// (2) End pin: minutes from every cell to `end`. One forward search per cell
// (the network is tiny), so waiting at the first stop counts the same as in (1).
const END_SAMPLES = [0, 10, 20, 30]
export function toEnd(net, day, end, t0) {
  const q = xy(end)
  const egress = net.near(q, ACCESS_M)
  return {
    minutes: net.cells.map((c) =>
      median(END_SAMPLES.map((d) => arriveAt(net, raptor(net, day, c, t0 + d), c, q, t0 + d, egress).minutes)),
    ),
    walk: net.cells.map((c) => walkMin(c, q)),
  }
}

// (3) Both pins: the fastest trip leaving at t0, as legs
export function trip(net, day, start, end, t0) {
  const p = xy(start)
  const q = xy(end)
  const r = raptor(net, day, p, t0)
  const { minutes, via } = arriveAt(net, r, p, q, t0)
  const walkOnly = walkMin(p, q)
  const stopLL = (s) => net.raw.stops[s]
  if (via < 0) return { minutes, walkOnly, legs: [{ kind: 'walk', min: walkOnly, path: [start, end] }] }

  // Walk back through the labels from the last stop to the start
  const legs = []
  let s = via
  legs.unshift({ kind: 'walk', min: minutes + t0 - r.best[via], path: [stopLL(via), end] })
  while (s !== undefined && r.prev[s]) {
    const pr = r.prev[s]
    if (pr.kind === 'access') {
      legs.unshift({ kind: 'walk', min: pr.walk, path: [start, stopLL(s)] })
      break
    }
    if (pr.kind === 'transfer') {
      legs.unshift({ kind: 'walk', min: pr.walk, path: [stopLL(pr.fromStop), stopLL(s)] })
      s = pr.fromStop
      continue
    }
    const row = pr.pat.t[pr.trip]
    legs.unshift({
      kind: 'ride',
      route: pr.pat.r,
      depart: row[pr.board],
      arrive: row[pr.alight],
      stops: pr.alight - pr.board,
      min: row[pr.alight] - row[pr.board],
      path: pr.pat.s.slice(pr.board, pr.alight + 1).map(stopLL),
    })
    s = pr.fromStop
  }
  // Waits: the gap between reaching a stop and the vehicle leaving. Back-to-back
  // walks (a transfer chained to another) read as one walk.
  let clock = t0
  const out = []
  for (const leg of legs) {
    if (leg.kind === 'ride') {
      if (leg.depart - clock > 0.5) out.push({ kind: 'wait', min: leg.depart - clock })
      clock = leg.arrive
      out.push(leg)
      continue
    }
    clock += leg.min
    const last = out.at(-1)
    if (last?.kind === 'walk') {
      last.min += leg.min
      last.path = [...last.path, ...leg.path.slice(1)]
    } else out.push({ ...leg })
  }
  return { minutes, walkOnly, legs: out }
}
