import json

with open('public/civic_data/downtown_parking.geojson', 'r') as f:
    data = json.load(f)

# Target: 42°58'53.6"N 81°14'35.0"W = 42.98156, -81.24306
target_lat, target_lng = 42.98156, -81.24306

for feat in data['features']:
    coords = feat['geometry']['coordinates'][0]
    avg_lng = sum(c[0] for c in coords) / len(coords)
    avg_lat = sum(c[1] for c in coords) / len(coords)
    
    dist = ((avg_lat - target_lat)**2 + (avg_lng - target_lng)**2)**0.5
    if dist < 0.002:
        props = feat['properties']
        print("OSM ID:", props.get("id", "?"))
        print("Name:", props.get("name", "unnamed"))
        print("Access:", props.get("access", "NOT SET"))
        print("All props:", json.dumps(props, indent=2))
        print("Centroid:", round(avg_lat, 6), round(avg_lng, 6))
        print("Distance:", round(dist, 6))
        print("---")
