"""
Hybrid Parking Ingestion Pipeline (Option 3)
=============================================
Source 1: City of London ArcGIS Layer 2 — 21 official Municipal Lots (authoritative)
Source 2: OpenStreetMap — Commercial pay-to-park lots (Impark, Indigo, etc.)
          Only included if they have BOTH fee=yes AND a named operator tag.

Deduplication: If an OSM lot centroid is within 50m of a City lot centroid, it's dropped
to avoid showing the same lot twice.
"""

import urllib.request
import urllib.parse
import json
import os
import time
import math

output_dir = 'c:/Development/DTL/public/civic_data'
os.makedirs(output_dir, exist_ok=True)
output_path = os.path.join(output_dir, 'downtown_parking.geojson')

# ============================================================
# STAGE 1: Fetch City of London Municipal Lots (ArcGIS Layer 2)
# ============================================================
print("=== Stage 1: Fetching City of London Municipal Lots ===")
city_url = "https://maps.london.ca/server/rest/services/OpenData/OpenData_Transportation/MapServer/2/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"
req = urllib.request.Request(city_url, headers={'User-Agent': 'DTL/1.0'})

city_features = []
try:
    with urllib.request.urlopen(req, timeout=15) as res:
        data = json.loads(res.read())
        raw_features = data.get('features', [])
        print(f"  Downloaded {len(raw_features)} municipal lot polygons")
        
        for feat in raw_features:
            props = feat['properties']
            geom = feat['geometry']
            if not geom or not geom.get('coordinates'):
                continue
            
            coords = geom['coordinates'][0]
            lot_name = props.get('LotName', 'Municipal Lot')
            
            # Ensure clockwise winding (Shoelace)
            area = 0
            for i in range(len(coords) - 1):
                area += (coords[i+1][0] - coords[i][0]) * (coords[i+1][1] + coords[i][1])
            if area < 0:
                coords.reverse()
            
            # Compute area in m² for estimated spots
            area_m2 = props.get('SHAPE.STArea()', 0)
            
            city_features.append({
                "type": "Feature",
                "properties": {
                    "id": f"city-{props.get('OBJECTID', '?')}",
                    "name": lot_name,
                    "operator": "City of London",
                    "source": "municipal",
                    "area_m2": round(area_m2, 1)
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [coords]
                }
            })
        
        print(f"  Processed {len(city_features)} valid municipal lots")

except Exception as e:
    print(f"  ERROR fetching City data: {e}")
    print("  Continuing with OSM-only fallback...")

# ============================================================
# STAGE 2: Fetch Commercial Pay-to-Park Lots from OSM
# ============================================================
print("\n=== Stage 2: Fetching Commercial Pay-to-Park Lots from OSM ===")

bbox = '42.975,-81.265,42.995,-81.220'
query = f"""
[out:json][timeout:60];
(
  way["amenity"="parking"]["fee"="yes"]["operator"]({bbox});
  relation["amenity"="parking"]["fee"="yes"]["operator"]({bbox});
);
out geom;
"""

endpoints = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
    'http://overpass-api.de/api/interpreter',
]

osm_features = []
osm_data = None
post_data = urllib.parse.urlencode({'data': query}).encode('utf-8')

for ep_url in endpoints:
    print(f"  Trying {ep_url}...")
    req = urllib.request.Request(ep_url, post_data, headers={'User-Agent': 'DTL/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            osm_data = json.loads(response.read().decode('utf-8'))
            print(f"  Success: {len(osm_data.get('elements', []))} elements")
            break
    except Exception as e:
        print(f"  Failed: {e}")
        time.sleep(1)

if osm_data:
    for el in osm_data.get('elements', []):
        tags = el.get('tags', {})
        
        # Double-check: skip private/customers even if they slipped through
        if tags.get('access') in ['private', 'customers', 'destination']:
            continue
        
        geom = el.get('geometry', [])
        if not geom:
            continue
        
        pts = [[p['lon'], p['lat']] for p in geom]
        if pts[0] != pts[-1]:
            pts.append(pts[0])
        
        # Shoelace for clockwise winding
        area = 0
        for i in range(len(pts) - 1):
            area += (pts[i+1][0] - pts[i][0]) * (pts[i+1][1] + pts[i][1])
        if area < 0:
            pts.reverse()
        
        # Compute approximate area in m² using the Shoelace formula in lat/lng
        signed_area = 0
        for i in range(len(pts) - 1):
            signed_area += pts[i][0] * pts[i+1][1] - pts[i+1][0] * pts[i][1]
        signed_area = abs(signed_area) / 2.0
        # Convert degrees² to m² (rough: 1° lat ≈ 111111m, 1° lng ≈ 81500m at this latitude)
        area_m2 = signed_area * 111111 * 81500
        
        operator = tags.get('operator', 'Unknown')
        name = tags.get('name', operator)
        
        osm_features.append({
            "type": "Feature",
            "properties": {
                "id": f"osm-{el['id']}",
                "name": name,
                "operator": operator,
                "source": "osm-commercial",
                "area_m2": round(area_m2, 1)
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [pts]
            }
        })
    
    print(f"  Processed {len(osm_features)} vetted commercial lots")
else:
    print("  WARNING: All OSM endpoints failed. Proceeding with City data only.")

# ============================================================
# STAGE 3: Deduplicate (drop OSM lots within 50m of a City lot)
# ============================================================
print("\n=== Stage 3: Deduplication ===")

def centroid(coords):
    lngs = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return sum(lngs) / len(lngs), sum(lats) / len(lats)

def haversine_m(lon1, lat1, lon2, lat2):
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

city_centroids = []
for f in city_features:
    c = centroid(f['geometry']['coordinates'][0])
    city_centroids.append(c)

deduplicated_osm = []
dropped = 0
for f in osm_features:
    c = centroid(f['geometry']['coordinates'][0])
    too_close = False
    for cc in city_centroids:
        if haversine_m(c[0], c[1], cc[0], cc[1]) < 50:
            too_close = True
            break
    if too_close:
        dropped += 1
        print(f"  DROPPED (duplicate): {f['properties']['name']} ({f['properties']['id']})")
    else:
        deduplicated_osm.append(f)

print(f"  Kept {len(deduplicated_osm)} commercial lots, dropped {dropped} duplicates")

# ============================================================
# STAGE 4: Merge and Write
# ============================================================
all_features = city_features + deduplicated_osm
print(f"\n=== Final Output ===")
print(f"  Municipal lots: {len(city_features)}")
print(f"  Commercial lots: {len(deduplicated_osm)}")
print(f"  TOTAL: {len(all_features)}")

with open(output_path, 'w') as f:
    json.dump({"type": "FeatureCollection", "features": all_features}, f, indent=2)

print(f"\n  Saved to {output_path}")
