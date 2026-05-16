# scraper/seed_promotions.py
import os
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone

load_dotenv()

url: str = os.getenv("SUPABASE_URL")
key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Error: Environment variables missing.")
    exit(1)

supabase: Client = create_client(url, key)

def seed_promo():
    # Set expiration 7 days from now
    expiry = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    
    mock_promo = {
        "venue_id": "v-1", # London Music Hall
        "title": "Skip the Line + 1 Free Drink",
        "description": "Show this QR code at the VIP entrance before 11 PM.",
        "discount_value": "VIP ACCESS",
        "active_until": expiry,
        "total_claims_allowed": 50
    }
    
    try:
        # Check if it exists to prevent duplicates
        existing = supabase.table('promotions').select('*').eq('venue_id', 'v-1').execute()
        if existing.data:
            print("Promotion already exists!")
            return

        response = supabase.table('promotions').insert(mock_promo).execute()
        print("Successfully seeded VIP Promotion for London Music Hall!")
    except Exception as e:
        print(f"Failed to seed promo: {e}")

if __name__ == "__main__":
    seed_promo()
