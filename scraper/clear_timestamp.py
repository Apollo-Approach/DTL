from supabase import create_client, Client
import os
from dotenv import load_dotenv

load_dotenv()
supabase: Client = create_client(os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_KEY"))

# Clear offerings to force a re-scrape for The Church Key Bistro-Pub
supabase.table("venues").update({"offerings": {}}).eq("name", "The Church Key Bistro-Pub").execute()
print("Cleared offerings for The Church Key Bistro-Pub")
