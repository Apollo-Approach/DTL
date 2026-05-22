#!/usr/bin/env python3
"""
One-time bulk location reconciliation script.

Reads Maps Grounding Lite data already stored in the `offerings` JSONB column
for every enriched venue, compares it against the venue's PostGIS location,
and auto-corrects any discrepancies exceeding 100 m (unless the venue has
`is_manually_curated = true`).

Usage:
    python scraper/reconcile_locations.py              # auto-correct mode
    python scraper/reconcile_locations.py --dry-run     # report only, no writes
"""
import os
import sys
import json
import math
import time
import logging
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("data/reconcile.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("dtl-reconcile")

MISMATCH_THRESHOLD_M = 100
DRY_RUN = "--dry-run" in sys.argv

# ── Helpers ──────────────────────────────────────────────────────────────────

def _haversine_meters(lat1, lon1, lat2, lon2):
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


import re

def _extract_address_from_summary(summary_text):
    if not summary_text:
        return None
    match = re.search(
        r'located at\s+([^.]+?,\s*London,\s*ON(?:\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d)?)',
        summary_text,
        re.IGNORECASE,
    )
    return match.group(1).strip().rstrip(',') if match else None


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        logger.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)

    supabase: Client = create_client(url, key)

    logger.info("=" * 60)
    logger.info("DTL Bulk Location Reconciliation")
    if DRY_RUN:
        logger.info("  MODE: DRY RUN (no writes)")
    else:
        logger.info("  MODE: AUTO-CORRECT")
    logger.info("=" * 60)

    # Fetch all venues with Maps data
    venues_response = supabase.table("venues").select(
        "id, name, address, is_manually_curated, offerings"
    ).neq("offerings", "{}").execute()

    venues = venues_response.data
    logger.info(f"Loaded {len(venues)} enriched venues")

    # Bulk-fetch all venue coordinates via the RPC function (avoids per-venue queries)
    coords_response = supabase.rpc("get_all_venue_coords", {}).execute()
    coords_map = {row["venue_id"]: (row["lat"], row["lng"]) for row in (coords_response.data or [])}
    logger.info(f"Loaded coordinates for {len(coords_map)} venues")

    stats = {"checked": 0, "ok": 0, "mismatch": 0, "corrected": 0, "skipped_curated": 0, "no_maps_data": 0}
    mismatches = []

    for venue in venues:
        venue_id = venue["id"]
        venue_name = venue["name"]
        db_address = venue.get("address", "")
        is_curated = venue.get("is_manually_curated", False)
        offerings = venue.get("offerings", {})

        if isinstance(offerings, str):
            try:
                offerings = json.loads(offerings)
            except json.JSONDecodeError:
                continue

        maps_data = offerings.get("maps_grounding_lite")
        if not maps_data or not isinstance(maps_data, dict):
            stats["no_maps_data"] += 1
            continue

        places = maps_data.get("places", [])
        if not places:
            stats["no_maps_data"] += 1
            continue

        maps_loc = places[0].get("location", {})
        maps_lat = maps_loc.get("latitude")
        maps_lng = maps_loc.get("longitude")
        if maps_lat is None or maps_lng is None:
            stats["no_maps_data"] += 1
            continue

        # Look up DB coordinates from the bulk-fetched map
        db_coords = coords_map.get(venue_id)
        db_lat = db_coords[0] if db_coords else None
        db_lng = db_coords[1] if db_coords else None

        stats["checked"] += 1

        if db_lat is None or db_lng is None:
            distance_m = float('inf')
        else:
            distance_m = _haversine_meters(db_lat, db_lng, maps_lat, maps_lng)

        maps_address = _extract_address_from_summary(maps_data.get("summary", ""))

        if distance_m <= MISMATCH_THRESHOLD_M:
            stats["ok"] += 1
            continue

        # Mismatch detected
        stats["mismatch"] += 1

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
        }
        mismatches.append(mismatch_record)

        if is_curated:
            stats["skipped_curated"] += 1
            logger.warning(
                f"  ⚠ MISMATCH {venue_name} (Δ {distance_m:.0f} m) — SKIPPED (curated)  "
                f"DB: {db_address} | Maps: {maps_address}"
            )
            mismatch_record["action"] = "skipped"
            continue

        if DRY_RUN:
            logger.info(
                f"  🔍 WOULD CORRECT {venue_name} (Δ {distance_m:.0f} m)  "
                f'"{db_address}" → "{maps_address or "(coords only)"}"'
            )
            mismatch_record["action"] = "dry_run"
            continue

        # Auto-correct
        update_payload = {
            "location": f"SRID=4326;POINT({maps_lng} {maps_lat})",
        }
        if maps_address:
            update_payload["address"] = maps_address

        try:
            supabase.table("venues").update(update_payload).eq("id", venue_id).execute()
            stats["corrected"] += 1
            logger.warning(
                f'  🔧 CORRECTED {venue_name} (Δ {distance_m:.0f} m)  '
                f'"{db_address}" → "{maps_address or "(coords only)"}"  '
                f'({db_lat},{db_lng}) → ({maps_lat},{maps_lng})'
            )
            mismatch_record["action"] = "corrected"
        except Exception as e:
            logger.error(f"  ✗ Failed to correct {venue_name}: {e}")
            mismatch_record["action"] = "error"

    # Save mismatches to audit log
    os.makedirs("data", exist_ok=True)
    with open("data/location_mismatches.jsonl", "a") as f:
        for record in mismatches:
            record["timestamp"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            f.write(json.dumps(record) + "\n")

    # Summary
    logger.info("\n" + "=" * 60)
    logger.info("RECONCILIATION SUMMARY")
    logger.info("=" * 60)
    logger.info(f"  Venues checked:       {stats['checked']}")
    logger.info(f"  Location OK (<100m):  {stats['ok']}")
    logger.info(f"  Mismatches found:     {stats['mismatch']}")
    logger.info(f"  Auto-corrected:       {stats['corrected']}")
    logger.info(f"  Skipped (curated):    {stats['skipped_curated']}")
    logger.info(f"  No Maps data:         {stats['no_maps_data']}")
    if DRY_RUN:
        logger.info("\n  ℹ️  This was a DRY RUN. Re-run without --dry-run to apply corrections.")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
