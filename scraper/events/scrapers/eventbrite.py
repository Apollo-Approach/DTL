"""
Eventbrite Event Scraper for London, Ontario
Fetches the search feed, discovers event URLs, then extracts JSON-LD from each page.
"""
import re
import json
import hashlib
import logging
import time
from datetime import datetime, timezone
from typing import Optional
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger("dtl-events")

EVENTBRITE_SEARCH_URL = "https://www.eventbrite.ca/d/canada--london-ontario/events/"
# Downtown London center coordinates
LONDON_LAT = 42.9834
LONDON_LNG = -81.2497

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-CA,en-US;q=0.9,en;q=0.8",
}

def _generate_dedup_hash(name: str, start_date: str, venue: str) -> str:
    """Generate SHA-256 dedup hash from normalized event key fields."""
    normalized = f"{name.lower().strip()}|{start_date}|{venue.lower().strip()}"
    return hashlib.sha256(normalized.encode()).hexdigest()

def _generate_event_id(url: str) -> str:
    """Generate a deterministic short event ID from Eventbrite URL."""
    hash_val = hashlib.md5(url.encode()).hexdigest()[:12]
    return f"evt-eb-{hash_val}"

def _extract_jsonld(html: str) -> Optional[dict]:
    """Extract the Event JSON-LD block from an Eventbrite page."""
    soup = BeautifulSoup(html, "html.parser")
    scripts = soup.find_all("script", {"type": "application/ld+json"})
    
    for script in scripts:
        try:
            data = json.loads(script.string)
            # Handle both single objects and arrays
            if isinstance(data, list):
                for item in data:
                    if item.get("@type") == "Event":
                        return item
            elif isinstance(data, dict):
                if data.get("@type") == "Event":
                    return data
        except (json.JSONDecodeError, TypeError):
            continue
    
    return None

def _discover_event_urls(html: str) -> list[str]:
    """Extract event URLs from the Eventbrite search results page."""
    soup = BeautifulSoup(html, "html.parser")
    urls = set()
    
    # Look for event links — Eventbrite URLs follow pattern: /e/event-name-tickets-NNNN
    for a_tag in soup.find_all("a", href=True):
        href = a_tag["href"]
        if "/e/" in href and "tickets-" in href:
            # Normalize URL
            if href.startswith("/"):
                href = f"https://www.eventbrite.ca{href}"
            elif href.startswith("https://www.eventbrite.com"):
                href = href.replace("eventbrite.com", "eventbrite.ca")
            # Strip query params
            href = href.split("?")[0]
            urls.add(href)
    
    return list(urls)

def _map_venue_to_id(venue_name: str) -> Optional[str]:
    """Map known Eventbrite venue names to our venue IDs."""
    # Actual venue IDs from Supabase venues table
    venue_map = {
        "london music hall": "v-london-music-hall",
        "rum runners": "v-london-music-hall",
        "toboggan brewing company": "v-toboggan",
        "toboggan brewing co.": "v-toboggan",
        "toboggan brewing co": "v-toboggan",
        "toboggan brewing": "v-toboggan",
        "toboggan": "v-toboggan",
        "budweiser gardens": "v-budweiser-gardens",
        "canada life place": "v-budweiser-gardens",
        "aeolian hall": "v-centennial",  # closest match
        "museum london": "v-coventgarden",  # closest match
        "the palace theatre": "v-grand-theatre",
        "palace theatre": "v-grand-theatre",
        "the grand theatre": "v-grand-theatre",
        "grand theatre": "v-grand-theatre",
        "centennial hall": "v-centennial",
        "wolf performance hall": "v-wolf",
        "joe kool's": "v-joe-kools",
        "joe kools": "v-joe-kools",
        "the ceeps": "v-the-ceeps",
        "aura nightclub": "v-aura",
        "lavish nightclub": "v-lavish",
        "tilt arcade bar": "v-tilt",
        "los lobos": "v-los-lobos",
        "the morrissey house": "v-morrissey",
        "the richmond tavern": "v-richmondtavern",
        "richmond tavern": "v-richmondtavern",
        "poacher's arms": "v-poachers",
        "barney's": "v-barneys",
        "the barking frog": "v-barking-frog",
    }
    if venue_name:
        normalized = venue_name.lower().strip()
        return venue_map.get(normalized)
    return None

def scrape_eventbrite_events(max_events: int = 30) -> list[dict]:
    """
    Scrape Eventbrite London ON events.
    1. Fetch search page to discover event URLs
    2. Fetch each event page and extract JSON-LD
    3. Return normalized event dicts
    """
    logger.info(f"Fetching Eventbrite search page: {EVENTBRITE_SEARCH_URL}")
    
    try:
        resp = requests.get(EVENTBRITE_SEARCH_URL, headers=HEADERS, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        logger.error(f"Failed to fetch Eventbrite search page: {e}")
        return []
    
    event_urls = _discover_event_urls(resp.text)
    logger.info(f"Discovered {len(event_urls)} event URLs from search page")
    
    if not event_urls:
        logger.warning("No event URLs found — Eventbrite may be blocking or layout changed")
        return []
    
    events = []
    
    for url in event_urls[:max_events]:
        try:
            time.sleep(1.5)  # Polite rate limiting
            logger.info(f"  Fetching: {url}")
            
            resp = requests.get(url, headers=HEADERS, timeout=15)
            if resp.status_code != 200:
                logger.warning(f"  Got {resp.status_code} for {url}")
                continue
            
            jsonld = _extract_jsonld(resp.text)
            if not jsonld:
                logger.warning(f"  No JSON-LD found on {url}")
                continue
            
            # Extract fields from JSON-LD
            name = jsonld.get("name", "").strip()
            start_date = jsonld.get("startDate", "")
            end_date = jsonld.get("endDate", start_date)
            
            # Location
            location = jsonld.get("location", {})
            venue_name = location.get("name", "London, ON") if isinstance(location, dict) else "London, ON"
            
            # Address
            address = {}
            if isinstance(location, dict):
                address = location.get("address", {})
                if isinstance(address, str):
                    address = {"streetAddress": address}
            
            # Pricing
            offers = jsonld.get("offers", {})
            if isinstance(offers, list):
                offers = offers[0] if offers else {}
            price = 0.0
            is_free = False
            try:
                price = float(offers.get("price", 0))
            except (ValueError, TypeError):
                pass
            if price == 0 or offers.get("price", "") == "0" or "free" in str(offers.get("availability", "")).lower():
                is_free = True
            
            # Image
            image_url = jsonld.get("image", None)
            if isinstance(image_url, list):
                image_url = image_url[0] if image_url else None
            
            # Map to our venue IDs
            venue_id = _map_venue_to_id(venue_name)
            
            event_id = _generate_event_id(url)
            dedup_hash = _generate_dedup_hash(name, start_date[:10] if start_date else "", venue_name)
            
            event = {
                "id": event_id,
                "name": name,
                "venue_id": venue_id,  # May be None for unknown venues
                "start_time": start_date,
                "end_time": end_date,
                "is_free": is_free,
                "price": price,
                "categories": ["LIVE_MUSIC"],  # Default; could be refined
                "description": jsonld.get("description", "")[:500],
                "ticket_url": url,
                "image_url": image_url,
                "source_platform": "eventbrite",
                "source_url": url,
                "dedup_hash": dedup_hash,
                # Eventbrite metadata for enrichment
                "_venue_name": venue_name,
                "_address": address,
            }
            
            events.append(event)
            logger.info(f"  ✓ {name} | {venue_name} | ${price} | {start_date[:10] if start_date else 'no date'}")
            
        except Exception as e:
            logger.error(f"  Failed to process {url}: {e}")
            continue
    
    logger.info(f"Scraped {len(events)} events from Eventbrite")
    return events


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    events = scrape_eventbrite_events(max_events=5)
    for e in events:
        print(f"  {e['name']} | {e.get('_venue_name')} | ${e['price']} | {e['source_url']}")
