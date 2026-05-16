import urllib.request
import json
import os
import math

def point_in_polygon(x, y, poly):
    """Ray casting algorithm for point in polygon."""
    n = len(poly)
    inside = False
    p1x, p1y = poly[0]
    for i in range(1, n + 1):
        p2x, p2y = poly[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

def haversine_m(lon1, lat1, lon2, lat2):
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def centroid(coords):
    lngs = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return sum(lngs) / len(lngs), sum(lats) / len(lats)

print("Fetching City of London Parking Inventory...")
url = 'https://maps.london.ca/server/rest/services/OpenData/OpenData_Transportation/MapServer/1/query?where=1=1&outFields=*&outSR=4326&f=json'
req = urllib.request.Request(url, headers={'User-Agent': 'DTL/1.0'})

honk_points = []
try:
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read())
        features = data.get('features', [])
        for f in features:
            zone_id = f['attributes'].get('HonkZoneID')
            geom = f.get('geometry')
            if zone_id and geom:
                honk_points.append({
                    'zone': zone_id,
                    'x': geom['x'],
                    'y': geom['y']
                })
        print(f"Loaded {len(honk_points)} active HonkMobile Zones from Open Data.")
except Exception as e:
    print('Failed to fetch Honk Zones:', e)
    exit(1)

# Load our parking geometries
geojson_path = 'c:/Development/DTL/public/civic_data/downtown_parking.geojson'
if not os.path.exists(geojson_path):
    print("Parking geojson not found.")
    exit(1)

with open(geojson_path, 'r') as f:
    parking_data = json.load(f)

print("Performing Spatial Join (point-in-polygon + 40m proximity fallback)...")
match_count = 0

for feature in parking_data['features']:
    poly = feature['geometry']['coordinates'][0]
    poly_centroid = centroid(poly)
    best_zone = None
    best_dist = float('inf')
    
    for hp in honk_points:
        # Try exact point-in-polygon first
        if point_in_polygon(hp['x'], hp['y'], poly):
            best_zone = hp['zone']
            break
        
        # Fallback: proximity to centroid (40m threshold)
        dist = haversine_m(hp['x'], hp['y'], poly_centroid[0], poly_centroid[1])
        if dist < 40 and dist < best_dist:
            best_dist = dist
            best_zone = hp['zone']
    
    if best_zone:
        feature['properties']['HonkZoneID'] = best_zone
        match_count += 1
        print(f"  Matched: {feature['properties']['name']} -> Zone {best_zone}")

with open(geojson_path, 'w') as f:
    json.dump(parking_data, f, indent=2)

print(f"\nSuccess: Spatially joined {match_count} HonkMobile Zones to parking polygons.")

