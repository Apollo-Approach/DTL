#!/usr/bin/env python3
"""
DTL Events & Promotions Pipeline Orchestrator
Runs all event/promotions scrapers, deduplicates, and upserts to Supabase.
"""
import os
import sys
import time
import logging
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scrapers.london_music_hall import scrape_lmh_events
from scrapers.eventbrite import scrape_eventbrite_events
from scrapers.london_food_specials import scrape_london_food_specials

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("dtl-events")

# LMH coordinates for PostGIS
LMH_POINT = "SRID=4326;POINT(-81.2497 42.9834)"
# Downtown London fallback
DOWNTOWN_POINT = "SRID=4326;POINT(-81.2453 42.9849)"

def get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        logger.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)
    return create_client(url, key)

def upsert_events(supabase: Client, events: list[dict]) -> int:
    """
    Upsert events into Supabase with merge-enrichment logic.
    Only overwrites null fields — never clobbers existing data.
    Returns count of successfully upserted events.
    """
    success_count = 0
    
    for event in events:
        try:
            dedup_hash = event.get("dedup_hash")
            if not dedup_hash:
                logger.warning(f"Skipping event without dedup_hash: {event.get('name')}")
                continue
            
            # Remove internal metadata fields (prefixed with _)
            clean_event = {k: v for k, v in event.items() if not k.startswith("_")}
            
            # Add PostGIS location — look up venue's actual coords from DB
            venue_id = clean_event.get("venue_id")
            if venue_id:
                venue_row = supabase.table("venues").select("location").eq("id", venue_id).single().execute()
                if venue_row.data and venue_row.data.get("location"):
                    # Venue already has location in DB — reuse it
                    clean_event["location"] = venue_row.data["location"]
                else:
                    clean_event["location"] = DOWNTOWN_POINT
            else:
                clean_event["location"] = DOWNTOWN_POINT
            
            # Check if event already exists
            existing = supabase.table("events").select("*").eq("dedup_hash", dedup_hash).execute()
            
            if existing.data and len(existing.data) > 0:
                # MERGE-ENRICHMENT: Only update null fields
                existing_event = existing.data[0]
                updates = {}
                
                for key, new_value in clean_event.items():
                    if key in ("id", "dedup_hash", "location"):
                        continue  # Never update these
                    existing_value = existing_event.get(key)
                    if existing_value is None and new_value is not None:
                        updates[key] = new_value
                
                if updates:
                    supabase.table("events").update(updates).eq("id", existing_event["id"]).execute()
                    logger.info(f"  ↗ Enriched: {event.get('name')} (+{len(updates)} fields)")
                else:
                    logger.info(f"  ⏭ No new data: {event.get('name')}")
                    
            else:
                # New event — INSERT
                # Ensure venue_id is valid (skip events without a mapped venue)
                if not clean_event.get("venue_id"):
                    logger.info(f"  ⏭ Skipping (no venue mapping): {event.get('name')} @ {event.get('_venue_name', 'unknown')}")
                    continue
                
                supabase.table("events").insert(clean_event).execute()
                logger.info(f"  ✓ Inserted: {event.get('name')}")
            
            success_count += 1
            
        except Exception as e:
            logger.error(f"  ✗ Failed to upsert '{event.get('name')}': {e}")
            continue
    
    return success_count

def upsert_promotions(supabase: Client, promotions: list[dict]) -> int:
    """
    Upsert promotions into Supabase with merge-enrichment logic.
    Only inserts promotions that have a matched venue_id.
    Returns count of successfully upserted promotions.
    """
    success_count = 0
    
    for promo in promotions:
        try:
            dedup_hash = promo.get("dedup_hash")
            if not dedup_hash:
                continue
            
            # Skip unmatched venues
            if not promo.get("venue_id"):
                continue
            
            # Remove internal metadata fields (prefixed with _)
            clean_promo = {k: v for k, v in promo.items() if not k.startswith("_")}
            
            # Remove None values to avoid overwriting with nulls
            clean_promo = {k: v for k, v in clean_promo.items() if v is not None}
            
            # Check if promotion already exists
            existing = supabase.table("promotions").select("*").eq("dedup_hash", dedup_hash).execute()
            
            if existing.data and len(existing.data) > 0:
                # MERGE-ENRICHMENT: Only update null fields
                existing_promo = existing.data[0]
                updates = {}
                
                for key, new_value in clean_promo.items():
                    if key in ("id", "dedup_hash"):
                        continue
                    existing_value = existing_promo.get(key)
                    if existing_value is None and new_value is not None:
                        updates[key] = new_value
                
                if updates:
                    supabase.table("promotions").update(updates).eq("id", existing_promo["id"]).execute()
                    logger.info(f"  ↗ Enriched promo: {promo.get('title', '')[:50]} (+{len(updates)} fields)")
            else:
                # New promotion — INSERT
                supabase.table("promotions").insert(clean_promo).execute()
                logger.info(f"  ✓ Inserted promo: {promo.get('title', '')[:50]}")
            
            success_count += 1
            
        except Exception as e:
            logger.error(f"  ✗ Failed to upsert promo '{promo.get('title', '')}': {e}")
            continue
    
    return success_count

def run_pipeline():
    """Run the full events pipeline."""
    logger.info("=" * 60)
    logger.info("DTL Events Pipeline — Starting")
    logger.info("=" * 60)
    
    supabase = get_supabase()
    all_events = []
    
    # 1. London Music Hall (RSS feed)
    logger.info("\n--- Source: London Music Hall ---")
    try:
        lmh_events = scrape_lmh_events()
        all_events.extend(lmh_events)
        logger.info(f"LMH: {len(lmh_events)} events scraped")
    except Exception as e:
        logger.error(f"LMH scraper failed: {e}")
    
    # 2. Eventbrite (JSON-LD)
    logger.info("\n--- Source: Eventbrite ---")
    try:
        eb_events = scrape_eventbrite_events(max_events=25)
        all_events.extend(eb_events)
        logger.info(f"Eventbrite: {len(eb_events)} events scraped")
    except Exception as e:
        logger.error(f"Eventbrite scraper failed: {e}")
    
    # 3. London Food Specials (Promotions via WP REST API)
    logger.info("\n--- Source: London Food Specials ---")
    try:
        lfs_promos = scrape_london_food_specials()
        logger.info(f"London Food Specials: {len(lfs_promos)} promotions scraped")
        promo_success = upsert_promotions(supabase, lfs_promos)
        logger.info(f"Promotions upserted: {promo_success}/{len(lfs_promos)}")
    except Exception as e:
        logger.error(f"London Food Specials scraper failed: {e}")
    
    # 4. Upsert all events to Supabase
    logger.info(f"\n--- Upserting {len(all_events)} events ---")
    success = upsert_events(supabase, all_events)
    logger.info(f"Pipeline complete: {success}/{len(all_events)} events processed")
    
    return success

def main():
    """Main loop — runs pipeline every 6 hours."""
    CYCLE_HOURS = int(os.getenv("EVENT_CYCLE_HOURS", "6"))
    
    while True:
        try:
            run_pipeline()
        except Exception as e:
            logger.error(f"Pipeline crashed: {e}")
        
        sleep_seconds = CYCLE_HOURS * 3600
        logger.info(f"Sleeping for {CYCLE_HOURS} hours...")
        time.sleep(sleep_seconds)

if __name__ == "__main__":
    # If --once flag is passed, run just one cycle
    if "--once" in sys.argv:
        run_pipeline()
    else:
        main()
