import os
import json
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in scraper/.env")
    exit(1)

supabase: Client = create_client(url, key)

new_venues = [
    {"id": "v-centennial", "name": "Centennial Hall", "address": "550 Wellington St, London, ON N6A 3P9", "type": "venue", "location": "SRID=4326;POINT(-81.2483 42.9877)", "status": "PERMANENT", "offerings": {}},
    {"id": "v-wolf", "name": "Wolf Performance Hall", "address": "251 Dundas St, London, ON N6A 6H9", "type": "venue", "location": "SRID=4326;POINT(-81.2460 42.9840)", "status": "PERMANENT", "offerings": {}},
    {"id": "v-tilt", "name": "Tilt Arcade Bar", "address": "143 King St, London, ON N6A 1C3", "type": "bar", "location": "SRID=4326;POINT(-81.2508 42.9834)", "status": "PERMANENT", "offerings": {}},
    {"id": "v-thewell", "name": "The Well", "address": "256 Richmond St, London, ON N6B 2H7", "type": "club", "location": "SRID=4326;POINT(-81.2515 42.9868)", "status": "PERMANENT", "offerings": {}},
    {"id": "v-aura", "name": "Aura Nightclub", "address": "735 Richmond St, London, ON N6A 3H3", "type": "club", "location": "SRID=4326;POINT(-81.2500 42.9845)", "status": "PERMANENT", "offerings": {}},
    {"id": "v-fitzrays", "name": "FitzRay's Restaurant & Lounge", "address": "110 Dundas St, London, ON N6A 1G1", "type": "restaurant", "location": "SRID=4326;POINT(-81.2520 42.9830)", "status": "PERMANENT", "offerings": {}},
    {"id": "v-morrissey", "name": "The Morrissey House", "address": "361 Dundas St, London, ON N6B 1V5", "type": "restaurant", "location": "SRID=4326;POINT(-81.2480 42.9820)", "status": "PERMANENT", "offerings": {}},
    {"id": "v-coventgarden", "name": "Covent Garden Market", "address": "130 King St, London, ON N6A 1C5", "type": "restaurant", "location": "SRID=4326;POINT(-81.2505 42.9826)", "status": "PERMANENT", "offerings": {}},
    {"id": "v-spageddy", "name": "Spageddy Eddy's", "address": "428 Richmond St, London, ON N6A 3E1", "type": "restaurant", "location": "SRID=4326;POINT(-81.2510 42.9850)", "status": "PERMANENT", "offerings": {}},
    {"id": "v-waldo", "name": "Waldo's on King", "address": "130 King St, London, ON N6A 1C5", "type": "restaurant", "location": "SRID=4326;POINT(-81.2505 42.9825)", "status": "PERMANENT", "offerings": {}},
    {"id": "v-barneys", "name": "Barney's", "address": "671 Richmond St, London, ON N6A 3G7", "type": "bar", "location": "SRID=4326;POINT(-81.2530 42.9875)", "status": "PERMANENT", "offerings": {}},
    {"id": "v-toboggan", "name": "Toboggan Brewing Co.", "address": "585 Richmond St, London, ON N6A 3G2", "type": "restaurant", "location": "SRID=4326;POINT(-81.2515 42.9855)", "status": "PERMANENT", "offerings": {}},
    {"id": "v-fellini", "name": "Fellini Koolini's", "address": "155 Albert St, London, ON N6A 1L9", "type": "restaurant", "location": "SRID=4326;POINT(-81.2530 42.9870)", "status": "PERMANENT", "offerings": {}},
    {"id": "v-winks", "name": "Wink's Eatery", "address": "551 Richmond St, London, ON N6A 3E9", "type": "restaurant", "location": "SRID=4326;POINT(-81.2525 42.9865)", "status": "PERMANENT", "offerings": {}},
    {"id": "v-warehouse", "name": "El Furniture Warehouse", "address": "533 Richmond St, London, ON N6A 3E9", "type": "restaurant", "location": "SRID=4326;POINT(-81.2520 42.9860)", "status": "PERMANENT", "offerings": {}}
]

try:
    response = supabase.table('venues').upsert(new_venues).execute()
    print(f"Successfully added {len(response.data)} new venues.")
except Exception as e:
    print(f"Failed: {e}")
