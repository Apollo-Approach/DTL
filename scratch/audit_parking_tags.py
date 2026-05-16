import urllib.request
import urllib.parse
import json

# Query the raw tags for all parking lots near the flagged coordinate
bbox = '42.978,-81.258,42.990,-81.240'
query = f"""
[out:json][timeout:30];
(
  way["amenity"="parking"]({bbox});
);
out tags;
"""

data = urllib.parse.urlencode({'data': query}).encode('utf-8')
url = 'http://overpass-api.de/api/interpreter'
req = urllib.request.Request(url, data=data, headers={'User-Agent': 'DTL/1.0'})

with urllib.request.urlopen(req, timeout=30) as res:
    result = json.loads(res.read().decode('utf-8'))

print(f"Total parking ways in bbox: {len(result['elements'])}")
print()

# Categorize by access tag
access_counts = {}
for el in result['elements']:
    tags = el.get('tags', {})
    access = tags.get('access', 'UNSET')
    parking_type = tags.get('parking', 'UNSET')
    fee = tags.get('fee', 'UNSET')
    access_counts[access] = access_counts.get(access, 0) + 1

print("=== Access Tag Distribution ===")
for k, v in sorted(access_counts.items(), key=lambda x: -x[1]):
    print(f"  {k}: {v}")

print()
print("=== Lots with NO access tag (the problem) ===")
for el in result['elements']:
    tags = el.get('tags', {})
    if 'access' not in tags:
        name = tags.get('name', tags.get('operator', 'unnamed'))
        parking = tags.get('parking', '?')
        fee = tags.get('fee', '?')
        surface = tags.get('surface', '?')
        print(f"  OSM {el['id']}: name={name}, parking={parking}, fee={fee}, surface={surface}")
