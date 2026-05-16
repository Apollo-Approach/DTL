# scraper/seed_safety_pin.py
import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url: str = os.getenv("SUPABASE_URL")
key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Error: Environment variables missing.")
    exit(1)

supabase: Client = create_client(url, key)

def seed_pin():
    # A wellness check near Dundas Place
    mock_pin = {
        "type": "WELLNESS_CHECK",
        "status": "REPORTED",
        "description": "Individual sleeping on bench near the intersection, needs a blanket/water.",
        "location": "SRID=4326;POINT(-81.2480 42.9830)"
    }
    
    try:
        response = supabase.table('safety_incidents').insert(mock_pin).execute()
        print("Successfully dropped a test safety pin!")
    except Exception as e:
        print(f"Failed to drop pin: {e}")

if __name__ == "__main__":
    seed_pin()
