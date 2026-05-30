import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

response = supabase.table("venues").select("name, website_url, offerings").execute()

problem_sites = []
for venue in response.data:
    offerings = venue.get("offerings")
    if isinstance(offerings, dict):
        if offerings.get("error") == "browser_crash" or "camoufox_crashed" in offerings.get("warnings", []):
            problem_sites.append(venue)

print("\n--- Problematic Sites ---")
for site in problem_sites:
    print(f"- {site['name']} ({site.get('website_url')})")
