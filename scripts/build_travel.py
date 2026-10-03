"""Build public/data/travel.json: a compact timetable and grid for the Travel
time view, small enough to route in the browser in milliseconds.

  stops     [[lat, lon], ...] every GTFS stop/platform near Oak Park
  days      {weekday|saturday|sunday: [pattern, ...]}
            pattern = {"r": "CTA:90", "s": [stop index, ...],
                       "t": [[minutes at each stop], ...] one row per trip, sorted}
  cells     [[lat, lon], ...] 100 m grid cell centers inside the Village

Uses the same stops, routes and sample days as scripts/build_service.py.

Usage:
  python3 scripts/build_travel.py <dir with cta.zip pace.zip metra.zip>
"""
import json
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

from shapely.geometry import Point, shape
from shapely.ops import transform

from build_service import ALIASES, APP_ROUTE, BOUNDARY, DAYS, ROOT, active_services, minutes, read, to_m, village_stops, M_LAT, M_LON

OUT = ROOT / "public/data/travel.json"
CELL_M = 100


def grid():
    feats = json.loads(BOUNDARY.read_text())["features"]
    village = transform(to_m, shape(next(f for f in feats if f["properties"]["kind"] == "village")["geometry"]))
    x0, y0, x1, y1 = village.bounds
    cells = []
    y = y0 + CELL_M / 2
    while y < y1:
        x = x0 + CELL_M / 2
        while x < x1:
            if village.contains(Point(x, y)):
                cells.append([round(y / M_LAT, 5), round(x / M_LON, 5)])
            x += CELL_M
        y += CELL_M
    return cells


def main():
    src = Path(sys.argv[1])
    # Every stop in the stops file, not just the ones by the Village line: a
    # trip may ride through River Forest or Forest Park stops on its way
    want = {a: set().union(*r.values()) for a, r in village_stops().items()}
    stop_index, stops = {}, []
    days = {d: [] for d in DAYS}

    for agency, fname in [("CTA", "cta.zip"), ("Pace", "pace.zip"), ("Metra", "metra.zip")]:
        z = zipfile.ZipFile(src / fname)
        names = {r for r in village_stops()[agency]}
        routes = {}
        for r in read(z, "routes.txt"):
            key = r.get("route_short_name") or r["route_id"]
            key = key if key in names else r["route_id"] if r["route_id"] in names else None
            if key:
                routes[r["route_id"]] = f"{agency}:{APP_ROUTE.get(key, key)}"
        info = {s["stop_id"]: s for s in read(z, "stops.txt")}
        svc = {d: active_services(z, day) for d, day in DAYS.items()}
        trips = {}
        for t in read(z, "trips.txt"):
            if t["route_id"] in routes:
                ds = [d for d in DAYS if t["service_id"] in svc[d]]
                if ds:
                    trips[t["trip_id"]] = (routes[t["route_id"]], ds)

        events = defaultdict(list)
        for st in read(z, "stop_times.txt"):
            tid, sid = st["trip_id"], st["stop_id"]
            if tid in trips and (sid in want[agency] or info.get(sid, {}).get("parent_station") in want[agency]):
                events[tid].append((int(st["stop_sequence"]), sid, minutes(st["departure_time"] or st["arrival_time"])))

        patterns = defaultdict(list)  # (route, stop tuple) -> [(times, days)]
        for tid, ev in events.items():
            if len(ev) < 2:
                continue  # one stop in the area: can't ride between two of them
            ev.sort()
            for _, sid, _ in ev:
                if sid not in stop_index:
                    s = info[sid]
                    stop_index[sid] = len(stops)
                    stops.append([round(float(s["stop_lat"]), 5), round(float(s["stop_lon"]), 5)])
            key = (trips[tid][0], tuple(stop_index[sid] for _, sid, _ in ev))
            patterns[key].append(([m for _, _, m in ev], trips[tid][1]))

        for (route, seq), rows in patterns.items():
            for d in DAYS:
                t = sorted(times for times, ds in rows if d in ds)
                if t:
                    days[d].append({"r": route, "s": list(seq), "t": t})

    cells = grid()
    OUT.write_text(json.dumps({"stops": stops, "days": days, "cells": cells, "cellM": CELL_M}, separators=(",", ":")))
    n = {d: sum(len(p["t"]) for p in ps) for d, ps in days.items()}
    print(f"{len(stops)} stops, {len(cells)} cells, patterns {[len(p) for p in days.values()]}, trips {n}")
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
