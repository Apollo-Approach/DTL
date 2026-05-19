import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url: str = os.getenv("SUPABASE_URL")
key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
    exit(1)

supabase: Client = create_client(url, key)

def seed_churches():
    churches = [
        {
            "id": "v-st-pauls",
            "name": "St. Paul's Cathedral",
            "description": "Historic Anglican cathedral in downtown London.",
            "address": "472 Richmond St, London, ON N6A 3E6",
            "location": "SRID=4326;POINT(-81.2505 42.9846)",
            "website_url": "https://www.stpaulscathedral.on.ca/"
        },
        {
            "id": "v-st-peters",
            "name": "St. Peter's Cathedral Basilica",
            "description": "Historic Roman Catholic basilica in downtown London.",
            "address": "196 Dufferin Ave, London, ON N6A 1K8",
            "location": "SRID=4326;POINT(-81.2483 42.9868)",
            "website_url": "https://www.cathedral.dionet.ca/"
        }
    ]

    try:
        response = supabase.table('venues').upsert(churches).execute()
        print(f"Successfully upserted churches: {response}")
    except Exception as e:
        print(f"Failed to ingest churches: {e}")

if __name__ == "__main__":
    seed_churches()
