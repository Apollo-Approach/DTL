"""
London Food Specials Scraper
Fetches daily food/drink specials from londonfoodspecials.com via WordPress REST API.
No headless browser needed — WP REST API returns full Elementor HTML server-side.
"""
import hashlib
import html
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger("dtl-events")

# WordPress REST API page IDs for each day
DAY_PAGE_IDS = {
    "monday": 357,
    "tuesday": 421,
    "wednesday": 451,
    "thursday": 473,
    "friday": 537,
    "saturday": 609,
    "sunday": 263,
}

WP_API_BASE = "https://londonfoodspecials.com/wp-json/wp/v2/pages"

HEADERS = {
    "User-Agent": "DTL-Nightly-Bot/1.0 (+https://dtlnightly.ca)",
    "Accept": "application/json",
}

# Map known venue names from londonfoodspecials.com → our Supabase venue IDs
VENUE_NAME_MAP = {
    "fitzrays": "v-fitzrays",
    "fitzray's": "v-fitzrays",
    "fitz rays": "v-fitzrays",
    "fitzray's restaurant & lounge": "v-fitzrays",
    "winks eatery": "v-winks",
    "wink's eatery": "v-winks",
    "molly bloom's irish pub": "v-molly-blooms",
    "molly bloom's": "v-molly-blooms",
    "the ceeps": "v-the-ceeps",
    "the scot's corner": "v-scots",
    "scot's corner": "v-scots",
    "barney's": "v-barneys",
    "poacher's arms": "v-poachers",
    "the barking frog": "v-barking-frog",
    "joe kool's": "v-joe-kools",
    "joe kools": "v-joe-kools",
    "toboggan brewing co.": "v-toboggan",
    "toboggan brewing": "v-toboggan",
    "toboggan": "v-toboggan",
    "los lobos": "v-los-lobos",
    "the morrissey house": "v-morrissey",
    "morrissey house": "v-morrissey",
    "the richmond tavern": "v-richmondtavern",
    "richmond tavern": "v-richmondtavern",
    "gnosh dining & cocktails": "v-gnosh",
    "gnosh": "v-gnosh",
    "grace restaurant": "v-grace",
    "tilt arcade bar": "v-tilt",
    "tilt": "v-tilt",
    "the squire pub & grill": "v-squire",
    "the church key bistro-pub": "v-church-key",
    "church key": "v-church-key",
    "the early bird": "v-early-bird",
    "early bird": "v-early-bird",
    "el furniture warehouse": "v-warehouse",
    "hunter & co.": "v-hunterco",
    "hunter & co": "v-hunterco",
    "london bicycle café": "v-londonbike",
    "london bicycle cafe": "v-londonbike",
    "marienbad restaurant & chaucer's pub": "v-marienbad",
    "marienbad": "v-marienbad",
    "chaucer's pub": "v-marienbad",
    "mythic grill": "v-mythic",
    "rebel remedy": "v-rebel",
    "delilah's": "v-delilahs",
    "the well": "v-thewell",
    "wolfepack company bar": "v-thewell",  # Same ownership group downtown
    "wolfe pack company bar": "v-thewell",
    "waldo's on king": "v-waldo",
    "waldo's": "v-waldo",
    "ironwood kitchen & bar": "v-church-key",  # same area
    "three10": "v-church-key",
    "fellini koolini's": "v-fellini",
    "fellini koolinis": "v-fellini",
    "dos tacos": "v-dostacos",
    "abruzzi ristorante": "v-abruzzi",
    "abruzzi": "v-abruzzi",
    "dimi's greek mezze": "v-dimis",
    "dimi's": "v-dimis",
    "david's bistro": "v-davids",
    "david's": "v-davids",
    "garlic's of london": "v-garlics",
    "garlic's": "v-garlics",
    "spageddy eddy's": "v-spageddy",
    "talbot bar & grille": "v-talbot",
    "talbot": "v-talbot",
    "cintro on wellington": "v-cintro",
    "cintro": "v-cintro",
    "zen'za pizzeria": "v-zenza",
    "zen'za": "v-zenza",
    "p-za-pie": "v-pzapie",
    "burger burger": "v-burgerburger",
    "bear & frankies": "v-bearfrankies",
    "bear & frankie's": "v-bearfrankies",
    "mccabe's irish pub & grill": "v-mccabes",
    "mccabe's irish pub": "v-mccabes",
    "mccabe's": "v-mccabes",
    "alibi roadhouse": "v-alibi",
    "alibi": "v-alibi",
    "frank & furter's restaurant & bar": "v-frank-furters",
    "frank & furter's": "v-frank-furters",
    "frank and furter's": "v-frank-furters",
    "jack astor's bar & grill": "v-jack-astors",
    "jack astor's": "v-jack-astors",
    "jack astors": "v-jack-astors",
}


def _generate_dedup_hash(venue_name: str, day: str, deal: str) -> str:
    """Generate SHA-256 dedup hash for a recurring promotion."""
    normalized = f"{venue_name.lower().strip()}|{day}|{deal.lower().strip()[:100]}"
    return hashlib.sha256(normalized.encode()).hexdigest()


def _generate_promo_id(venue_name: str, day: str) -> str:
    """Generate a deterministic promotion ID."""
    hash_val = hashlib.md5(f"{venue_name}|{day}".encode()).hexdigest()[:12]
    return f"promo-lfs-{hash_val}"


def _match_venue_id(venue_name: str) -> Optional[str]:
    """Try to match a venue name to our Supabase venue ID."""
    if not venue_name:
        return None
    normalized = venue_name.lower().strip()
    # Direct match
    if normalized in VENUE_NAME_MAP:
        return VENUE_NAME_MAP[normalized]
    # Partial match — check if any key is contained in the venue name
    for key, venue_id in VENUE_NAME_MAP.items():
        if key in normalized or normalized in key:
            return venue_id
    return None


def _parse_time_window(deal_text: str) -> tuple[Optional[str], Optional[str]]:
    """
    Extract time window from deal description.
    Returns (active_from_time, active_until_time) as HH:MM strings.
    """
    # Match patterns like "3pm - 5pm", "from 5pm - 10pm", "after 9pm", "8pm - Close"
    time_pattern = re.compile(
        r'(?:from\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*[-–to]+\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)|close)',
        re.IGNORECASE
    )
    match = time_pattern.search(deal_text)
    if match:
        from_time = _parse_single_time(match.group(1))
        to_raw = match.group(2).strip().lower()
        to_time = "02:00" if to_raw == "close" else _parse_single_time(to_raw)
        return from_time, to_time

    # Match "after 9pm" pattern
    after_pattern = re.compile(r'after\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))', re.IGNORECASE)
    after_match = after_pattern.search(deal_text)
    if after_match:
        from_time = _parse_single_time(after_match.group(1))
        return from_time, "02:00"  # Until close

    return None, None


def _parse_single_time(time_str: str) -> Optional[str]:
    """Parse a single time string like '5pm' or '3:30pm' to 'HH:MM' format."""
    if not time_str:
        return None
    time_str = time_str.strip().lower()
    match = re.match(r'(\d{1,2})(?::(\d{2}))?\s*(am|pm)', time_str)
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2) or 0)
    period = match.group(3)
    if period == 'pm' and hour != 12:
        hour += 12
    elif period == 'am' and hour == 12:
        hour = 0
    return f"{hour:02d}:{minute:02d}"


def _fetch_day_page(day: str, page_id: int) -> list[dict]:
    """Fetch and parse a single day's specials from the WP REST API."""
    url = f"{WP_API_BASE}/{page_id}?_fields=content"
    logger.info(f"  Fetching {day} specials (page_id={page_id})")

    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        logger.error(f"  Failed to fetch {day} page: {e}")
        return []

    data = resp.json()
    content_html = data.get("content", {}).get("rendered", "")
    if not content_html:
        logger.warning(f"  No content found for {day}")
        return []

    soup = BeautifulSoup(content_html, "html.parser")

    # Extract venue-deal pairs from Elementor icon-box structure
    promotions = []
    icon_boxes = soup.find_all("div", class_="elementor-icon-box-content")

    for box in icon_boxes:
        title_el = box.find(class_="elementor-icon-box-title")
        desc_el = box.find(class_="elementor-icon-box-description")

        if not title_el or not desc_el:
            continue

        venue_name = title_el.get_text(strip=True)
        deal_text = desc_el.get_text(strip=True)

        # Decode HTML entities
        venue_name = html.unescape(venue_name)
        deal_text = html.unescape(deal_text)

        if not venue_name or not deal_text:
            continue

        # Try to match to our DB venue
        venue_id = _match_venue_id(venue_name)

        # Parse time window
        active_from, active_until = _parse_time_window(deal_text)

        promo_id = _generate_promo_id(venue_name, day)
        dedup_hash = _generate_dedup_hash(venue_name, day, deal_text)

        # Generate a deterministic UUID from the dedup hash
        promo_uuid = str(uuid.uuid5(uuid.NAMESPACE_URL, dedup_hash))

        promo = {
            "id": promo_uuid,
            "venue_id": venue_id,  # May be None for non-DTL venues
            "title": f"{venue_name} - {day.capitalize()} Special",
            "description": deal_text,
            # Required NOT NULL fields in the schema
            "discount_value": deal_text[:100],  # Use deal text as discount value
            "active_until": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),  # Recurring, so far future
            "total_claims_allowed": 999999,  # Recurring deal — unlimited
            # Recurring weekly fields
            "recurring_day": day,
            "active_from_time": active_from,
            "active_until_time": active_until,
            "source_platform": "london_food_specials",
            "source_url": f"https://londonfoodspecials.com/{day}/",
            "dedup_hash": dedup_hash,
            # Internal metadata
            "_venue_name": venue_name,
            "_matched": venue_id is not None,
        }

        promotions.append(promo)

    logger.info(f"  {day}: {len(promotions)} specials found, {sum(1 for p in promotions if p['_matched'])} matched to DTL venues")
    return promotions


def scrape_london_food_specials() -> list[dict]:
    """
    Scrape all 7 days of food specials from londonfoodspecials.com.
    Uses the WordPress REST API — no headless browser needed.
    """
    logger.info("Scraping London Food Specials (WP REST API)")
    all_promotions = []

    for day, page_id in DAY_PAGE_IDS.items():
        day_promos = _fetch_day_page(day, page_id)
        all_promotions.extend(day_promos)

    total = len(all_promotions)
    matched = sum(1 for p in all_promotions if p["_matched"])
    unmatched = total - matched
    logger.info(f"London Food Specials: {total} total promotions, {matched} matched, {unmatched} unmatched")

    return all_promotions


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    promos = scrape_london_food_specials()
    print(f"\n{'='*60}")
    print(f"Total: {len(promos)} promotions")
    print(f"Matched to DTL venues: {sum(1 for p in promos if p['_matched'])}")
    print(f"\nMatched venues:")
    for p in promos:
        if p["_matched"]:
            print(f"  ✓ {p['_venue_name']} ({p['venue_id']}) | {p['recurring_day']} | {p['description'][:60]}")
    print(f"\nUnmatched venues (potential new stubs):")
    seen = set()
    for p in promos:
        if not p["_matched"] and p["_venue_name"] not in seen:
            seen.add(p["_venue_name"])
            print(f"  ? {p['_venue_name']}")
