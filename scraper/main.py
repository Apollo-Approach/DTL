import os
import time
import logging
from dotenv import load_dotenv
from supabase import create_client, Client
from camoufox.sync_api import Camoufox
from scraper import scrape_venue_data, gentle_sleep
from llm_client import synthesize_offerings

# Configure robust logging to both file and stdout
os.makedirs('data', exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("data/scraper.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("dtl-scraper")

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error("Missing Supabase credentials in .env")
    raise ValueError("Missing Supabase credentials in .env")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def process_venues():
    logger.info("Starting venue enrichment cycle...")
    
    try:
        # Optimization 1: Database-Level Filtering
        logger.info("Querying Supabase for venues missing offerings...")
        response = supabase.table("venues").select("id, name, website_url").is_("offerings", "null").execute()
        venues_to_process = response.data
                
        logger.info(f"Found {len(venues_to_process)} venues needing enrichment.")
        
        if not venues_to_process:
            return

        # Optimization 2: Keep Browser Alive
        logger.info("Booting up Camoufox browser instance...")
        with Camoufox(headless=True) as browser:
            for venue in venues_to_process:
                venue_id = venue["id"]
                venue_name = venue["name"]
                website_url = venue.get("website_url")
                
                logger.info(f"--- Processing: {venue_name} ---")
                
                # We pass the active browser to avoid cold-booting it for every venue
                raw_text = scrape_venue_data(venue_name, website_url, browser)
                
                if raw_text:
                    logger.info(f"Sending {len(raw_text)} chars to Llamabox for synthesis...")
                    offerings_json = synthesize_offerings(raw_text, venue_name)
                    
                    logger.info(f"Synthesized JSON for {venue_name}: {offerings_json}")
                    
                    if offerings_json:
                        logger.info(f"Updating Supabase for {venue_name}...")
                        supabase.table("venues").update({"offerings": offerings_json}).eq("id", venue_id).execute()
                    else:
                        logger.warning(f"Failed to synthesize JSON for {venue_name}.")
                else:
                    logger.warning(f"No text extracted for {venue_name}.")
                    
                gentle_sleep()
            
    except Exception as e:
        logger.error(f"Error in processing loop: {e}", exc_info=True)

if __name__ == "__main__":
    while True:
        process_venues()
        logger.info("Cycle complete. Sleeping for 12 hours...")
        time.sleep(12 * 60 * 60)
