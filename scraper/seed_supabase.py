# scraper/seed_supabase.py
import os
import json
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables from scraper/.env
load_dotenv()

url: str = os.getenv("SUPABASE_URL")
key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY") # Use Service Role to bypass RLS for inserts

if not url or not key:
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in scraper/.env")
    exit(1)

supabase: Client = create_client(url, key)

def seed_database():
    filepath = 'output/events_export.jsonl'
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}. Please run the Scrapy spider first.")
        return

    events_to_insert = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            if not line.strip():
                continue
            event_data = json.loads(line)
            
            # Convert GeoJSON dictionary back to PostGIS WKT format
            lon, lat = event_data['location']['coordinates']
            event_data['location'] = f"SRID=4326;POINT({lon} {lat})"
            
            events_to_insert.append(event_data)

    if events_to_insert:
        try:
            # 1. Ensure the mock venue exists first to satisfy the SQL foreign key constraint
            mock_venue = {
                "id": "v-1",
                "name": "London Music Hall",
                "description": "Premier live music and concert venue in downtown London.",
                "address": "185 Queens Ave, London, ON N6A 1G7",
                "location": f"SRID=4326;POINT(-81.2505 42.9839)"
            }
            supabase.table('venues').upsert([mock_venue]).execute()
            print("Successfully upserted parent venue (v-1).")

            # 2. Upsert the events
            response = supabase.table('events').upsert(events_to_insert).execute()
            print(f"Successfully ingested {len(response.data)} events from JSONL.")
        except Exception as e:
            print(f"Failed to ingest data: {e}")

if __name__ == "__main__":
    seed_database()
