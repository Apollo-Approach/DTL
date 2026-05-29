import os
import re
import time
import json
import math
import logging
import requests
from dotenv import load_dotenv
from supabase import create_client, Client
from scraper import scrape_venue_data, gentle_sleep
from llm_client import synthesize_offerings, cross_reference
from review_queue import queue_review

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
        # Removed the logic that resets previously crashed venues, 
        # so we don't end up in an infinite crash loop on bad sites.

        # Optimization 1: Database-Level Filtering
        logger.info("Querying Supabase for venues...")
        import datetime
        four_days_ago = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=4)
        
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
                    if last_scraped.tzinfo is None:
                        last_scraped = last_scraped.replace(tzinfo=datetime.timezone.utc)
                    if last_scraped < four_days_ago:
                        venues_to_process.append(v)
                except ValueError:
                    venues_to_process.append(v)
            else:
                venues_to_process.append(v)
                
        logger.info(f"Found {len(venues_to_process)} venues needing enrichment.")
        
        if not venues_to_process:
            return True

        # Optimization 2: Subprocess isolation
        processed_ids = set()  # Track what we've already done this cycle
        
        for venue in venues_to_process:
            venue_id = venue["id"]
            venue_name = venue["name"]
            website_url = venue.get("website_url")
            
            logger.info(f"--- Processing: {venue_name} ---")
            
            is_parked = False
            try:
                raw_text, browser_died, is_parked = scrape_venue_data(venue_name, website_url)
            except Exception as e:
                logger.error(f"Scrape loop failed unexpectedly on {venue_name}: {e}", exc_info=True)
                browser_died = True
                raw_text = None
                is_parked = False
                
            processed_ids.add(venue_id)
            
            if is_parked:
                import datetime
                updated_offerings = venue.get("offerings", {})
                if not isinstance(updated_offerings, dict):
                    updated_offerings = {}
                updated_offerings["error"] = "parked_domain"
                updated_offerings["last_scraped_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
                supabase.table("venues").update({"offerings": updated_offerings}).eq("id", venue_id).execute()
                continue

            if raw_text:
                import hashlib
                current_hash = hashlib.sha256(raw_text.encode('utf-8')).hexdigest()
                old_hash = venue.get("offerings", {}).get("page_hash") if isinstance(venue.get("offerings"), dict) else None
                
                if old_hash and old_hash == current_hash:
                    logger.info(f"Hash matched for {venue_name} ({current_hash[:8]}...). Skipping Llamabox synthesis!")
                    import datetime
                    updated_offerings = venue.get("offerings", {})
                    if browser_died:
                        updated_offerings["warnings"] = updated_offerings.get("warnings", []) + ["camoufox_crashed"]
                    updated_offerings["last_scraped_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
                    supabase.table("venues").update({"offerings": updated_offerings}).eq("id", venue_id).execute()
                else:
                    logger.info(f"Sending {len(raw_text)} chars to Llamabox for synthesis (hash diff/new)...")
                    offerings_json = synthesize_offerings(raw_text, venue_name)
                    
                    logger.info(f"Synthesized JSON for {venue_name}: {offerings_json}")
                    
                    if offerings_json is None:
                        logger.warning(f"Total synthesis failure for {venue_name} — skipping DB write so it retries next cycle.")
                    elif offerings_json is not None:
                        offerings_json["page_hash"] = current_hash
                        if browser_died:
                            offerings_json["warnings"] = ["camoufox_crashed_used_curl_fallback"]
                        # Call Grounding Lite to compare
                        logger.info(f"Calling Maps Grounding Lite for {venue_name}...")
                        maps_data = get_grounding_lite_data(venue_name)
                        
                        if maps_data:
                            logger.info(f"Received Maps data for {venue_name}. Injecting into offerings...")
                            offerings_json["maps_grounding_lite"] = maps_data
                            
                            # Cross-reference LLM events against Maps Grounding data
                            xref_warnings = cross_reference(
                                offerings_json.get("upcoming_events", []),
                                maps_data,
                                venue_name
                            )
                            for w in xref_warnings:
                                logger.warning(f"  [CROSS-REF] {venue_name}: {w}")
                                queue_review(
                                    supabase, venue_id, venue_name,
                                    review_type="cross_reference_mismatch",
                                    title=w,
                                    severity="warning",
                                    details={"maps_summary": maps_data.get("summary", "")[:500]}
                                )
                            if xref_warnings:
                                offerings_json["cross_reference_warnings"] = xref_warnings
                            
                            # Reconcile: compare Maps location against DB and auto-correct if wrong
                            reconcile_venue_location(supabase, venue_id, venue_name, maps_data)
                        
                        logger.info(f"Updating Supabase for {venue_name}...")
                        import datetime
                        offerings_json["last_scraped_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
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
                            logger.info(f"Found {len(upcoming_events)} candidate events for {venue_name}")
                            from datetime import datetime, timedelta
                            import hashlib as _hashlib
                            
                            # Get venue location for the event record
                            venue_loc = None
                            try:
                                venue_row = supabase.table("venues").select("location").eq("id", venue_id).single().execute()
                                if venue_row.data:
                                    venue_loc = venue_row.data.get("location")
                            except Exception:
                                pass
                            
                            # Build the full source text (lowercase) for validation
                            source_text_lower = (raw_text or "").lower()
                            
                            validated_count = 0
                            rejected_count = 0
                            
                            for ev in upcoming_events:
                                if not isinstance(ev, dict): continue
                                ev_name = ev.get("name", "")
                                start_time_str = ev.get("start_time", "")
                                source_quote = ev.get("source_quote", "")
                                if not ev_name or not start_time_str: continue
                                
                                # ── LAYER 1: Keyword grep ──
                                # Extract meaningful keywords from the event name
                                # and check if any appear in the scraped source text
                                stop_words = {'the', 'a', 'an', 'at', 'on', 'in', 'for', 'and', 'or', 'of', 'night', 'nights', 'weekly', 'recurring', 'event', 'events', 'every'}
                                keywords = [w.lower() for w in ev_name.split() if w.lower() not in stop_words and len(w) > 2]
                                keyword_hits = sum(1 for kw in keywords if kw in source_text_lower)
                                keyword_ratio = keyword_hits / max(len(keywords), 1)
                                
                                # ── LAYER 2: Source quote verification ──
                                quote_verified = False
                                if source_quote and len(source_quote) > 10:
                                    # Check if a meaningful substring of the quote appears in source text
                                    # Use a sliding window of 20+ chars to allow for minor LLM reformatting
                                    quote_lower = source_quote.lower()
                                    # Check exact match first
                                    if quote_lower in source_text_lower:
                                        quote_verified = True
                                    else:
                                        # Check if at least a 20-char substring matches
                                        for i in range(0, max(1, len(quote_lower) - 20)):
                                            chunk = quote_lower[i:i+20]
                                            if chunk in source_text_lower:
                                                quote_verified = True
                                                break
                                
                                # ── DECISION ──
                                # Accept if: keywords found in text OR source quote verified
                                if keyword_ratio < 0.5 and not quote_verified:
                                    logger.warning(f"  ✗ REJECTED (hallucination): '{ev_name}' — no keywords found in source text and quote not verified. Quote: '{source_quote[:80]}...'")
                                    queue_review(
                                        supabase, venue_id, venue_name,
                                        review_type="hallucination_rejected",
                                        title=f"Rejected event: {ev_name}",
                                        severity="warning",
                                        details={
                                            "event_name": ev_name,
                                            "source_quote": source_quote[:200],
                                            "keyword_ratio": keyword_ratio,
                                            "quote_verified": quote_verified
                                        }
                                    )
                                    rejected_count += 1
                                    continue
                                
                                logger.info(f"  ✓ VALIDATED: '{ev_name}' (keywords={keyword_ratio:.0%}, quote={'✓' if quote_verified else '✗'})")
                                
                                try:
                                    start_dt = datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
                                    end_dt = start_dt + timedelta(hours=3)
                                    
                                    # Generate a stable dedup hash
                                    dedup_raw = f"llm_synthesis|{venue_id}|{ev_name}|{start_dt.isoformat()}"
                                    dedup_hash = _hashlib.sha256(dedup_raw.encode()).hexdigest()
                                    
                                    event_record = {
                                        "id": f"llm-{dedup_hash[:12]}",
                                        "venue_id": venue_id,
                                        "name": ev_name,
                                        "description": ev.get("description", ""),
                                        "start_time": start_dt.isoformat(),
                                        "end_time": end_dt.isoformat(),
                                        "ticket_url": ev.get("ticket_url") or website_url,
                                        "source_platform": "llm_synthesis",
                                        "source_url": website_url,
                                        "is_free": False,
                                        "price": 0,
                                        "categories": ["LIVE_MUSIC"],
                                        "dedup_hash": dedup_hash,
                                    }
                                    
                                    # Add location if we have it
                                    if venue_loc:
                                        event_record["location"] = venue_loc
                                    
                                    supabase.table("events").upsert(event_record, on_conflict="dedup_hash").execute()
                                    validated_count += 1
                                    logger.info(f"  → Event Upserted: {ev_name} @ {start_dt.isoformat()}")
                                except Exception as ev_e:
                                    logger.warning(f"  Failed to insert event '{ev_name}' for {venue_name}: {ev_e}")
                            
                            logger.info(f"  Events summary for {venue_name}: {validated_count} accepted, {rejected_count} rejected")

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
