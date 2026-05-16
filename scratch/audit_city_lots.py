import urllib.request
import json

# Layer 2: Parking Off Street - the AUTHORITATIVE municipal list
url = "https://maps.london.ca/server/rest/services/OpenData/OpenData_Transportation/MapServer/2/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"
req = urllib.request.Request(url, headers={'User-Agent': 'DTL/1.0'})

with urllib.request.urlopen(req, timeout=15) as res:
    data = json.loads(res.read())
    features = data.get('features', [])
    print(f"City official off-street parking features: {len(features)}")
    print()
    for f in features:
        p = f['properties']
        geom = f['geometry']
        coord_str = str(geom.get('coordinates', ''))[:60] if geom else 'none'
        print(f"  Name: {p.get('Name', p.get('name', '?'))}")
        print(f"  All props: {json.dumps({k:v for k,v in p.items() if v}, indent=4)}")
        print(f"  Geom type: {geom['type'] if geom else 'none'}, coords: {coord_str}...")
        print()
