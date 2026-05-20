"""
London Music Hall Event Scraper
Extracts events from the LMH WordPress RSS feed at /events/feed/
Parses content:encoded for venue subroom, age restrictions, and door times.
"""
import re
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional
import feedparser
from bs4 import BeautifulSoup

logger = logging.getLogger("dtl-events")

LMH_RSS_URL = "https://londonmusichall.com/events/feed/"

# LMH main venue coordinates (182 Dundas St, London ON)
LMH_LAT = 42.9834
LMH_LNG = -81.2497

def _detect_subroom(html_content: str) -> str:
    """Detect if event is at Rum Runners or main London Music Hall."""
    text = html_content.lower()
    if "rum runners" in text:
        return "Rum Runners"
    return "London Music Hall"

def _detect_age_restriction(html_content: str) -> Optional[str]:
    """Extract age restriction from event description."""
    text = html_content.lower()
    if "19+ event" in text or "19+" in text:
        return "19+"
    if "all ages" in text or "licensed/all ages" in text:
        return "All Ages"
    return None

def _extract_door_time(html_content: str) -> Optional[str]:
    """Extract door time like 'Doors: 6:00 PM' from description."""
    match = re.search(r'doors?[:\s]+(\d{1,2}(?::\d{2})?\s*[APap][Mm])', html_content, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return None

def _clean_html(html: str) -> str:
    """Strip HTML tags and clean up text for description."""
    soup = BeautifulSoup(html, "html.parser")
    # Remove the "The post ... appeared first on ..." boilerplate
    text = soup.get_text(separator="\n", strip=True)
    # Remove WordPress boilerplate
    text = re.sub(r'The post .+ appeared first on .+\.?', '', text).strip()
    return text

def _generate_dedup_hash(name: str, start_date: str, venue: str) -> str:
    """Generate SHA-256 dedup hash from normalized event key fields."""
    normalized = f"{name.lower().strip()}|{start_date}|{venue.lower().strip()}"
    return hashlib.sha256(normalized.encode()).hexdigest()

def _generate_event_id(guid: str) -> str:
    """Generate a deterministic short event ID from WordPress GUID."""
    hash_val = hashlib.md5(guid.encode()).hexdigest()[:12]
    return f"evt-lmh-{hash_val}"

def scrape_lmh_events() -> list[dict]:
    """
    Scrape London Music Hall events from their RSS feed.
    Paginates through all feed pages (?paged=N) to get all events.
    Returns a list of event dicts ready for Supabase insertion.
    """
    events = []
    max_pages = 10  # Safety limit
    
    for page in range(1, max_pages + 1):
        url = f"{LMH_RSS_URL}?paged={page}" if page > 1 else LMH_RSS_URL
        logger.info(f"Fetching LMH RSS feed page {page}: {url}")
        
        feed = feedparser.parse(url)
        
        if feed.bozo and not feed.entries:
            logger.info(f"Page {page}: feed error with no entries, stopping pagination")
            break
        
        if not feed.entries:
            logger.info(f"Page {page}: no entries, stopping pagination")
            break
        
        page_count = 0
        for entry in feed.entries:
            try:
                title = entry.get("title", "").strip()
                link = entry.get("link", "")
                guid = entry.get("id", link)
                pub_date = entry.get("published", "")
                
                # Get the rich content (content:encoded)
                content_html = ""
                if hasattr(entry, "content") and entry.content:
                    content_html = entry.content[0].get("value", "")
                elif hasattr(entry, "summary"):
                    content_html = entry.summary or ""
                
                # Extract metadata from content
                subroom = _detect_subroom(content_html)
                age_restriction = _detect_age_restriction(content_html)
                door_time_str = _extract_door_time(content_html)
                description = _clean_html(content_html)
                
                # Parse publication date as event date
                # Note: RSS pubDate is when the post was published, not the event date
                # LMH doesn't include actual event dates in RSS metadata
                # We use pubDate as a proxy and the scraper should be run frequently
                if pub_date:
                    try:
                        parsed_date = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
                    except (TypeError, AttributeError):
                        parsed_date = datetime.now(timezone.utc)
                else:
                    parsed_date = datetime.now(timezone.utc)
                
                # Use pubDate as start_time (best we have from RSS)
                # Events without explicit dates are still valuable as "upcoming"
                start_time = parsed_date.isoformat()
                # Default 4-hour event duration
                end_time = parsed_date.replace(
                    hour=min(parsed_date.hour + 4, 23)
                ).isoformat()
                
                event_id = _generate_event_id(guid)
                venue_name = "London Music Hall"
                dedup_hash = _generate_dedup_hash(title, start_time[:10], venue_name)
                
                event = {
                    "id": event_id,
                    "name": title,
                    "venue_id": "v-london-music-hall",  # Known venue ID in our DB
                    "start_time": start_time,
                    "end_time": end_time,
                    "is_free": False,
                    "price": 0.0,
                    "categories": ["LIVE_MUSIC"],
                    "description": description[:500] if description else f"Live at {subroom}",
                    "ticket_url": link,
                    "source_platform": "london_music_hall",
                    "source_url": link,
                    "age_restriction": age_restriction,
                    "venue_subroom": subroom,
                    "dedup_hash": dedup_hash,
                }
                
                events.append(event)
                page_count += 1
                logger.info(f"  Parsed: {title} @ {subroom} | {age_restriction or 'No age info'}")
                
            except Exception as e:
                logger.error(f"  Failed to parse entry: {e}")
                continue
        
        logger.info(f"Page {page}: scraped {page_count} events")
    
    logger.info(f"Scraped {len(events)} total events from LMH RSS feed ({page} pages)")
    return events


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    events = scrape_lmh_events()
    for e in events:
        print(f"  {e['name']} | {e['venue_subroom']} | {e['age_restriction']} | {e['source_url']}")
