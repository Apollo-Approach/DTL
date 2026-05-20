import os
import time
import json
import logging
import requests
from dotenv import load_dotenv
from supabase import create_client, Client
from camoufox.sync_api import Camoufox
from scraper import scrape_venue_data, gentle_sleep, BrowserDeadError
from llm_client import synthesize_offerings

def get_grounding_lite_data(venue_name):
    api_key = os.environ.get("MAPS_GROUNDING_LITE_API_KEY")
    if not api_key:
        return {}
    
    url = "https://mapstools.googleapis.com/mcp"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key
    }
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "search_places",
            "arguments": {
                "textQuery": f"{venue_name} in London ON"
            }
        }
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        
        result = response.json()
        content = result.get("result", {}).get("content", [])
        if not content:
            return {}
        
        text_data = content[0].get("text", "{}")
        try:
            return json.loads(text_data)
        except json.JSONDecodeError:
            return {"raw_text": text_data}
    except Exception as e:
        logger = logging.getLogger("dtl-scraper")
        logger.error(f"Error calling Maps Grounding Lite for {venue_name}: {e}")
        return {}

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
        # Reset venues that were flagged as browser_crash so we can try the new safe mode
        logger.info("Resetting previously crashed venues...")
        try:
            supabase.table("venues").update({"offerings": "{}"}).filter("offerings->error", "eq", '"browser_crash"').execute()
        except Exception as e:
            pass

        # Optimization 1: Database-Level Filtering
        logger.info("Querying Supabase for venues missing offerings...")
        response = supabase.table("venues").select("id, name, website_url").eq("offerings", "{}").execute()
        venues_to_process = response.data
                
        logger.info(f"Found {len(venues_to_process)} venues needing enrichment.")
        
        if not venues_to_process:
            return True

        # Optimization 2: Keep Browser Alive
        logger.info("Booting up Camoufox browser instance...")
        with Camoufox(headless=True) as browser:
            for venue in venues_to_process:
                venue_id = venue["id"]
                venue_name = venue["name"]
                website_url = venue.get("website_url")
                
                logger.info(f"--- Processing: {venue_name} ---")
                
                # We pass the active browser to avoid cold-booting it for every venue
                try:
                    raw_text = scrape_venue_data(venue_name, website_url, browser)
                except BrowserDeadError:
                    logger.error(f"Browser is dead for {venue_name}. Marking as failed and aborting current batch.")
                    try:
                        supabase.table("venues").update({"offerings": {"error": "browser_crash"}}).eq("id", venue_id).execute()
                    except Exception as db_e:
                        logger.error(f"Failed to update DB for crashed venue: {db_e}")
                    os._exit(1)
                
                if raw_text:
                    logger.info(f"Sending {len(raw_text)} chars to Llamabox for synthesis...")
                    offerings_json = synthesize_offerings(raw_text, venue_name)
                    
                    logger.info(f"Synthesized JSON for {venue_name}: {offerings_json}")
                    
                    if offerings_json is None:
                        logger.warning(f"Total synthesis failure for {venue_name} — skipping DB write so it retries next cycle.")
                    elif offerings_json is not None:
                        # Call Grounding Lite to compare
                        logger.info(f"Calling Maps Grounding Lite for {venue_name}...")
                        maps_data = get_grounding_lite_data(venue_name)
                        
                        if maps_data:
                            logger.info(f"Received Maps data for {venue_name}. Injecting into offerings...")
                            offerings_json["maps_grounding_lite"] = maps_data
                        
                        logger.info(f"Updating Supabase for {venue_name}...")
                        supabase.table("venues").update({"offerings": offerings_json}).eq("id", venue_id).execute()
                        
                        # Extract daily_specials and insert into promotions table
                        daily_specials = offerings_json.get("daily_specials", [])
                        if daily_specials and isinstance(daily_specials, list):
                            logger.info(f"Found {len(daily_specials)} daily specials for {venue_name}")
                            import hashlib
                            from datetime import datetime, timedelta, timezone
                            for special in daily_specials:
                                if not isinstance(special, dict):
                                    continue
                                day = special.get("day", "")
                                deal = special.get("deal", "")
                                time_window = special.get("time_window", "")
                                if not day or not deal:
                                    continue
                                # Generate dedup hash
                                dedup_str = f"{venue_id}|{day.lower()}|{deal.lower()}"
                                dedup_hash = hashlib.sha256(dedup_str.encode()).hexdigest()
                                promo = {
                                    "venue_id": venue_id,
                                    "title": deal,
                                    "description": f"{day}: {deal}" + (f" ({time_window})" if time_window else ""),
                                    "discount_value": deal,
                                    "active_until": (datetime.now(timezone.utc) + timedelta(days=90)).isoformat(),
                                    "recurring_day": day.lower(),
                                    "source_platform": "llm_synthesis",
                                    "dedup_hash": dedup_hash,
                                }
                                try:
                                    supabase.table("promotions").upsert(promo, on_conflict="dedup_hash").execute()
                                    logger.info(f"  → Promo: {day} - {deal}")
                                except Exception as promo_e:
                                    logger.warning(f"  Failed to insert promo for {venue_name}: {promo_e}")
                else:
                    logger.warning(f"No text extracted for {venue_name}.")
                    
                gentle_sleep()

                
        return True
            
    except Exception as e:
        logger.error(f"Error in processing loop: {e}", exc_info=True)
        return False

if __name__ == "__main__":
    while True:
        success = process_venues()
        if success:
            logger.info("Cycle complete. Sleeping for 12 hours...")
            time.sleep(12 * 60 * 60)
        else:
            logger.info("Cycle aborted mid-way. Retrying in 10 seconds...")
            time.sleep(10)
