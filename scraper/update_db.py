import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Ensure the offerings JSON doesn't block re-scraping
response = supabase.table('venues').select('id, offerings').ilike('name', '%Church Key%').execute()
for v in response.data:
    offerings = v.get('offerings', {})
    if isinstance(offerings, dict):
        offerings.pop('last_scraped_at', None)
        offerings.pop('error', None)
        supabase.table('venues').update({'website_url': 'https://thechurchkey.ca/', 'offerings': offerings}).eq('id', v['id']).execute()

print("Updated The Church Key URL to https://thechurchkey.ca/ and cleared last_scraped_at to trigger re-scrape.")
