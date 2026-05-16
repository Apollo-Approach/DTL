import urllib.request
import urllib.parse
import json
import os
import time

output_dir = 'c:/Development/DTL/public/civic_data'
os.makedirs(output_dir, exist_ok=True)

# 1. Fetch BIA Boundaries
bia_url = 'https://maps.london.ca/server/rest/services/OpenData/OpenData_Community/MapServer/11/query?where=1=1&outFields=*&outSR=4326&f=geojson'
req_bia = urllib.request.Request(bia_url, headers={'User-Agent': 'DTL/1.0'})

print("Fetching BIA Boundaries from ArcGIS...")
bia_geojson = None
try:
    with urllib.request.urlopen(req_bia) as res:
        bia_geojson = json.loads(res.read())
        print(f"Downloaded {len(bia_geojson.get('features', []))} BIA boundaries.")
        with open(os.path.join(output_dir, 'bia_boundaries.geojson'), 'w') as f:
            json.dump(bia_geojson, f, indent=2)
except Exception as e:
    print('Failed to fetch BIA Boundaries:', e)
    exit(1)

# 2. Fetch Retail Buildings from OSM
print("Fetching Retail Buildings from OSM Overpass...")
overpass_url = "http://overpass-api.de/api/interpreter"

# Bounding box roughly covering London, Ontario
bbox = "42.93,-81.33,43.06,-81.16"
query = f"""
[out:json][timeout:25];
(
  way["building"]["shop"]({bbox});
  way["building"]["amenity"~"restaurant|cafe|bar|pub|fast_food|nightclub|theatre|arts_centre|cinema|events_venue"]({bbox});
);
out body;
>;
out skel qt;
"""

def fetch_overpass(q):
    data = urllib.parse.urlencode({'data': q}).encode('utf-8')
    req = urllib.request.Request(overpass_url, data=data, headers={'User-Agent': 'DTL/1.0'})
    try:
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print(f"Overpass API HTTP Error: {e.code}")
        return None
    except Exception as e:
        print(f"Overpass API Error: {e}")
        return None

osm_data = None
for attempt in range(3):
    osm_data = fetch_overpass(query)
    if osm_data:
        break
    print("Retrying in 5 seconds...")
    time.sleep(5)

if not osm_data:
    print("Failed to fetch OSM data.")
    exit(1)

# 3. Process OSM data into GeoJSON with Clockwise Winding for MapLibre
nodes = {node['id']: (node['lon'], node['lat']) for node in osm_data['elements'] if node['type'] == 'node'}
ways = [way for way in osm_data['elements'] if way['type'] == 'way']

def polygon_area(coords):
    """Shoelace formula to calculate signed area to determine winding order"""
    area = 0.0
    n = len(coords)
    for i in range(n):
        j = (i + 1) % n
        area += coords[i][0] * coords[j][1] - coords[j][0] * coords[i][1]
    return area / 2.0

def categorize_venue(amenity, shop):
    """Map OSM tags to DTL Nightly categories"""
    if amenity in ['pub', 'bar', 'nightclub']:
        return 'Nightlife'
    elif amenity in ['theatre', 'arts_centre', 'cinema', 'events_venue']:
        return 'Stage'
    elif amenity in ['restaurant', 'cafe', 'fast_food', 'food_court', 'ice_cream', 'biergarten']:
        return 'Eatery'
    elif shop in ['bakery', 'deli', 'pastry', 'coffee']:
        return 'Eatery'
    return 'Retail'

features = []
for way in ways:
    try:
        coords = [nodes[nid] for nid in way['nodes'] if nid in nodes]
        if len(coords) < 3: continue
        
        # Ensure it's a closed ring
        if coords[0] != coords[-1]:
            coords.append(coords[0])
            
        area = polygon_area(coords)
        # MapLibre requires CLOCKWISE winding for exterior rings.
        if area > 0:
            coords.reverse()
            
        tags = way.get('tags', {})
        name = tags.get('name', 'Retail Business')
        amenity_val = tags.get('amenity', '')
        shop_val = tags.get('shop', '')
        
        # Determine master category and soft descriptor
        master_category = categorize_venue(amenity_val, shop_val)
        descriptor = amenity_val if amenity_val else shop_val
        
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [coords]
            },
            "properties": {
                "id": way['id'],
                "name": name,
                "category": master_category,
                "descriptor": descriptor.replace('_', ' ').title() if descriptor else 'Retail'
            }
        })
    except Exception as e:
        continue

geojson = {
    "type": "FeatureCollection",
    "features": features
}

output_path = os.path.join(output_dir, 'bia_retail_buildings.geojson')
with open(output_path, 'w') as f:
    json.dump(geojson, f, indent=2)

print(f"Success: Processed {len(features)} retail buildings and saved to {output_path}")
