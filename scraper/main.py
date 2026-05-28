import os
import re
import time
import json
import math
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


def _haversine_meters(lat1, lon1, lat2, lon2):
    """Return the great-circle distance in meters between two lat/lng pairs."""
    R = 6_371_000  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _extract_address_from_summary(summary_text):
    """Pull a street address out of the Maps Grounding Lite summary.
    Typical pattern: '...located at 349 Talbot St, London, ON...'
    """
    if not summary_text:
        return None
    match = re.search(
        r'located at\s+([^.]+?,\s*London,\s*ON(?:\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d)?)',
        summary_text,
        re.IGNORECASE,
    )
    return match.group(1).strip().rstrip(',') if match else None


def reconcile_venue_location(supabase_client, venue_id, venue_name, maps_data):
    """Compare the venue's stored DB address/location against Maps Grounding
    Lite data.  If the discrepancy is significant (>100 m) and the venue is
    NOT manually curated, auto-correct the address and PostGIS location.

    Every mismatch is appended to  data/location_mismatches.jsonl  for audit.
    """
    MISMATCH_THRESHOLD_M = 100  # metres

    places = maps_data.get("places", [])
    if not places:
        return

    maps_loc = places[0].get("location", {})
    maps_lat = maps_loc.get("latitude")
    maps_lng = maps_loc.get("longitude")
    if maps_lat is None or maps_lng is None:
        return

    # Fetch the venue's current DB address and PostGIS coords
    try:
        row = (
            supabase_client.table("venues")
            .select("address, is_manually_curated, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng")
            .eq("id", venue_id)
            .single()
            .execute()
        )
        venue_row = row.data
    except Exception as e:
        logger.warning(f"Could not fetch venue row for reconciliation ({venue_id}): {e}")
        return

    if not venue_row:
        return

    db_lat = venue_row.get("lat")
    db_lng = venue_row.get("lng")
    db_address = venue_row.get("address", "")
    is_curated = venue_row.get("is_manually_curated", False)

    if db_lat is None or db_lng is None:
        # No location stored — always accept Maps data
        distance_m = float('inf')
    else:
        distance_m = _haversine_meters(db_lat, db_lng, maps_lat, maps_lng)

    # Extract address from the Maps summary
    maps_address = _extract_address_from_summary(maps_data.get("summary", ""))

    if distance_m <= MISMATCH_THRESHOLD_M:
        logger.info(f"  ✓ Location OK for {venue_name} (Δ {distance_m:.0f} m)")
        return

    # ---- Mismatch detected ----
    mismatch_record = {
        "venue_id": venue_id,
        "venue_name": venue_name,
        "db_address": db_address,
        "db_lat": db_lat,
        "db_lng": db_lng,
        "maps_address": maps_address,
        "maps_lat": maps_lat,
        "maps_lng": maps_lng,
        "distance_m": round(distance_m, 1),
        "is_manually_curated": is_curated,
        "action": "skipped" if is_curated else "auto_corrected",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    # Persist the mismatch for audit
    os.makedirs("data", exist_ok=True)
    with open("data/location_mismatches.jsonl", "a") as f:
        f.write(json.dumps(mismatch_record) + "\n")

    if is_curated:
        logger.warning(
            f"  ⚠ MISMATCH for {venue_name} (Δ {distance_m:.0f} m) — "
            f"DB: {db_address} | Maps: {maps_address}  "
            f"[SKIPPED: is_manually_curated=true]"
        )
        return

    # Auto-correct
    update_payload = {
        "location": f"SRID=4326;POINT({maps_lng} {maps_lat})",
    }
    if maps_address:
        update_payload["address"] = maps_address

    try:
        supabase_client.table("venues").update(update_payload).eq("id", venue_id).execute()
        logger.warning(
            f"  🔧 AUTO-CORRECTED {venue_name} (Δ {distance_m:.0f} m) — "
            f"\"{db_address}\" → \"{maps_address or '(coords only)'}\"  "
            f"({db_lat},{db_lng}) → ({maps_lat},{maps_lng})"
        )
    except Exception as e:
        logger.error(f"  ✗ Failed to auto-correct location for {venue_name}: {e}")

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
        logger.info("Querying Supabase for venues...")
        import datetime
        thirty_days_ago = datetime.datetime.now() - datetime.timedelta(days=30)
        
        response = supabase.table("venues").select("id, name, website_url, offerings").execute()
        
        venues_to_process = []
        for v in response.data:
            offerings = v.get("offerings")
            if not offerings or offerings == "{}":
                venues_to_process.append(v)
                continue
                
            if isinstance(offerings, dict) and "last_scraped_at" in offerings:
                try:
                    last_scraped = datetime.datetime.fromisoformat(offerings["last_scraped_at"])
                    if last_scraped < thirty_days_ago:
                        venues_to_process.append(v)
                except ValueError:
                    venues_to_process.append(v)
            else:
                venues_to_process.append(v)
                
        logger.info(f"Found {len(venues_to_process)} venues needing enrichment.")
        
        if not venues_to_process:
            return True

        # Optimization 2: Keep Browser Alive — with crash recovery
        logger.info("Booting up Camoufox browser instance...")
        processed_ids = set()  # Track what we've already done this cycle
        
        while True:
            remaining = [v for v in venues_to_process if v["id"] not in processed_ids]
            if not remaining:
                break
            
            try:
                with Camoufox(headless=True) as browser:
                    for venue in remaining:
                        venue_id = venue["id"]
                        venue_name = venue["name"]
                        website_url = venue.get("website_url")
                        
                        logger.info(f"--- Processing: {venue_name} ---")
                        
                        try:
                            raw_text, browser_died = scrape_venue_data(venue_name, website_url, browser)
                        except Exception as browser_e:
                            logger.error(f"Browser crashed unexpectedly on {venue_name}: {browser_e}")
                            browser_died = True
                            raw_text = None
                            
                        processed_ids.add(venue_id)
                        
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
                                    
                                    # Reconcile: compare Maps location against DB and auto-correct if wrong
                                    reconcile_venue_location(supabase, venue_id, venue_name, maps_data)
                                
                                logger.info(f"Updating Supabase for {venue_name}...")
                                import datetime
                                offerings_json["last_scraped_at"] = datetime.datetime.now().isoformat()
                                supabase.table("venues").update({"offerings": offerings_json}).eq("id", venue_id).execute()
                                
                                # Check for Eventbrite Organizer ID
                                eb_id = offerings_json.get("eventbrite_organizer_id")
                                if eb_id and str(eb_id).isdigit():
                                    logger.info(f"Discovered Eventbrite Organizer ID {eb_id} for {venue_name}")
                                    try:
                                        supabase.table("eventbrite_organizers").upsert({
                                            "id": str(eb_id),
                                            "name": venue_name,
                                            "discovery_source": "llm_website_scraper"
                                        }, on_conflict="id").execute()
                                    except Exception as eb_e:
                                        logger.warning(f"Failed to upsert eventbrite organizer {eb_id}: {eb_e}")

                                # Extract upcoming_events and insert into events table
                                upcoming_events = offerings_json.get("upcoming_events", [])
                                if upcoming_events and isinstance(upcoming_events, list):
                                    logger.info(f"Found {len(upcoming_events)} events for {venue_name}")
                                    from datetime import datetime, timedelta
                                    for ev in upcoming_events:
                                        if not isinstance(ev, dict): continue
                                        ev_name = ev.get("name", "")
                                        start_time_str = ev.get("start_time", "")
                                        if not ev_name or not start_time_str: continue
                                        
                                        try:
                                            start_dt = datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
                                            end_dt = start_dt + timedelta(hours=3)
                                            
                                            event_record = {
                                                "venue_id": venue_id,
                                                "name": ev_name,
                                                "description": ev.get("description", ""),
                                                "start_time": start_dt.isoformat(),
                                                "end_time": end_dt.isoformat(),
                                                "status": "published",
                                                "ticket_url": ev.get("ticket_url") or website_url,
                                                "source_platform": "llm_synthesis"
                                            }
                                            
                                            # Upsert on conflict venue_id, name
                                            supabase.table("events").upsert(event_record, on_conflict="venue_id, name").execute()
                                            logger.info(f"  → Event Upserted: {ev_name}")
                                        except Exception as ev_e:
                                            logger.warning(f"  Failed to insert event '{ev_name}' for {venue_name}: {ev_e}")

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
                        
                        if browser_died:
                            logger.error(f"Browser died while processing {venue_name}. Respawning for the remaining venues...")
                            break  # Break inner loop, re-enter while loop with fresh browser
                    else:
                        # for-loop completed without break — all remaining venues processed
                        break
            except Exception as browser_e:
                logger.error(f"Browser session failed unexpectedly: {browser_e}", exc_info=True)
                logger.info("Will respawn browser and continue with remaining venues...")
                time.sleep(5)

                
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
