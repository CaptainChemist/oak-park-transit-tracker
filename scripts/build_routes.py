"""Build public/data/routes.geojson from CTA, Pace and Metra GTFS zips.

Keeps only the routes that serve stops in transit-stops-oak-park.csv and
clips their shapes to a box around Oak Park so the file stays small.

Usage:
  python3 scripts/build_routes.py <dir with cta.zip pace.zip metra.zip>

Downloads:
  cta.zip   https://www.transitchicago.com/downloads/sch_data/google_transit.zip
  pace.zip  https://www.pacebus.com/sites/default/files/2026-08/GTFS.zip
  metra.zip https://schedules.metrarail.com/gtfs/schedule.zip
"""
import csv
import io
import json
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STOPS_CSV = ROOT / "public/data/transit-stops-oak-park.csv"
OUT = ROOT / "public/data/routes.geojson"

# Oak Park plus a small margin
BBOX = (41.862, 41.912, -87.822, -87.765)  # min_lat, max_lat, min_lon, max_lon

# Names used in the stops CSV that differ from GTFS route_short_name / route_id
ALIASES = {"Green Line": "G", "Blue Line": "Blue"}


def inside(lat, lon):
    return BBOX[0] <= lat <= BBOX[1] and BBOX[2] <= lon <= BBOX[3]


def read(z, name):
    with z.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"), skipinitialspace=True)


def wanted_routes():
    out = defaultdict(set)
    for row in csv.DictReader(open(STOPS_CSV)):
        for r in row["routes"].split(";"):
            r = r.strip()
            if r:
                out[row["agency"]].add(ALIASES.get(r, r))
    return out


def clip(points):
    """Split a polyline into runs inside BBOX, keeping one point either side."""
    runs, cur = [], []
    for i, (lat, lon) in enumerate(points):
        if inside(lat, lon):
            if not cur and i > 0:
                cur.append(points[i - 1])
            cur.append((lat, lon))
        elif cur:
            cur.append((lat, lon))
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return [r for r in runs if len(r) > 1]


def build(agency, zip_path, want):
    z = zipfile.ZipFile(zip_path)
    routes = {}
    for r in read(z, "routes.txt"):
        key = r.get("route_short_name") or r["route_id"]
        if key in want or r["route_id"] in want:
            routes[r["route_id"]] = r
    shape_ids = defaultdict(set)
    for t in read(z, "trips.txt"):
        if t["route_id"] in routes and t.get("shape_id"):
            shape_ids[t["shape_id"]].add(t["route_id"])
    pts = defaultdict(list)
    for s in read(z, "shapes.txt"):
        if s["shape_id"] in shape_ids:
            pts[s["shape_id"]].append(
                (int(s["shape_pt_sequence"]), float(s["shape_pt_lat"]), float(s["shape_pt_lon"]))
            )
    features, seen = [], set()
    for sid, p in pts.items():
        p.sort()
        line = [(round(lat, 5), round(lon, 5)) for _, lat, lon in p]
        for run in clip(line):
            for rid in shape_ids[sid]:
                key = (rid, tuple(run[:: max(1, len(run) // 20)]))
                if key in seen:
                    continue
                seen.add(key)
                r = routes[rid]
                features.append({
                    "type": "Feature",
                    "properties": {
                        "agency": agency,
                        "route": r.get("route_short_name") or r["route_id"],
                        "name": r.get("route_long_name", ""),
                        "color": "#" + (r.get("route_color") or "666666"),
                        "type": int(r["route_type"]),
                    },
                    "geometry": {"type": "LineString", "coordinates": [[lon, lat] for lat, lon in run]},
                })
    print(f"{agency}: {len(routes)} routes, {len(features)} line segments")
    return features


def main():
    src = Path(sys.argv[1])
    want = wanted_routes()
    feats = []
    for agency, fname in [("CTA", "cta.zip"), ("Pace", "pace.zip"), ("Metra", "metra.zip")]:
        feats += build(agency, src / fname, want[agency])
    OUT.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")))
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
