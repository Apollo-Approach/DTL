# scraper/process_gtfs.py
import csv
import json
import os

GTFS_DIR = "C:/Development/DTL/google_transit"
OUTPUT_FILE = "public/civic_data/ltc_shapes.geojson"

def process_gtfs():
    print(f"Reading GTFS payload from {GTFS_DIR}...")
    
    print("Parsing routes.txt...")
    routes = {}
    with open(os.path.join(GTFS_DIR, 'routes.txt'), 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            color = f"#{row.get('route_color', '006c5b')}" if row.get('route_color') else '#006c5b'
            routes[row['route_id']] = color

    print("Parsing trips.txt...")
    shape_to_route = {}
    with open(os.path.join(GTFS_DIR, 'trips.txt'), 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            shape_to_route[row['shape_id']] = row['route_id']

    print("Parsing shapes.txt (This takes a moment)...")
    shapes = {}
    with open(os.path.join(GTFS_DIR, 'shapes.txt'), 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            shape_id = row['shape_id']
            if shape_id not in shapes:
                shapes[shape_id] = []
            shapes[shape_id].append({
                'seq': int(row['shape_pt_sequence']),
                'coord': [float(row['shape_pt_lon']), float(row['shape_pt_lat'])]
            })

    print("Building GeoJSON LineStrings...")
    features = []
    processed_routes = set()
    
    for shape_id, points in shapes.items():
        route_id = shape_to_route.get(shape_id)
        # To save memory, we only keep one shape variant per route for the MVP visualizer
        if route_id and route_id not in processed_routes:
            points.sort(key=lambda x: x['seq'])
            coords = [p['coord'] for p in points]
            
            features.append({
                "type": "Feature",
                "geometry": { "type": "LineString", "coordinates": coords },
                "properties": { "routeId": route_id, "color": routes.get(route_id, "#006c5b") }
            })
            processed_routes.add(route_id)

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump({"type": "FeatureCollection", "features": features}, f)
        
    print(f"Successfully extracted {len(features)} route shapes to {OUTPUT_FILE}!")

if __name__ == "__main__":
    process_gtfs()
