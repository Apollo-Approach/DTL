import urllib.request
import json
import os

url = 'https://maps.london.ca/server/rest/services/OpenData/OpenData_Transportation/MapServer/3/query?where=1=1&outFields=*&outSR=4326&f=geojson'
req = urllib.request.Request(url, headers={'User-Agent': 'DTL/1.0'})

output_dir = 'c:/Development/DTL/public/civic_data'
os.makedirs(output_dir, exist_ok=True)
output_path = os.path.join(output_dir, 'on_street_parking.geojson')

print("Fetching On-Street Parking GeoJSON from ArcGIS...")
try:
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read())
        
        features = data.get('features', [])
        print(f"Downloaded {len(features)} on-street parking features.")
        
        # Save to static geojson
        with open(output_path, 'w') as f:
            json.dump(data, f, indent=2)
            
        print(f"Success: Saved to {output_path}")
except Exception as e:
    print('Failed to fetch On-Street Parking:', e)
