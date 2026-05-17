import os
import csv
import json

def generate_trip_mapping():
    # Paths relative to the script location
    script_dir = os.path.dirname(__file__)
    trips_file = os.path.join(script_dir, '..', 'google_transit', 'trips.txt')
    output_dir = os.path.join(script_dir, '..', 'src', 'lib', 'data')
    output_file = os.path.join(output_dir, 'trip_mapping.json')

    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)

    if not os.path.exists(trips_file):
        print(f"Error: {trips_file} not found.")
        return

    mapping = {}
    
    print(f"Parsing {trips_file}...")
    with open(trips_file, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            trip_id = row.get('trip_id')
            headsign = row.get('trip_headsign')
            if trip_id and headsign:
                mapping[trip_id] = headsign
                
    print(f"Generated mapping for {len(mapping)} trips.")
    
    with open(output_file, mode='w', encoding='utf-8') as f:
        json.dump(mapping, f, separators=(',', ':')) # Minified
        
    print(f"Successfully saved to {output_file}")

if __name__ == "__main__":
    generate_trip_mapping()
