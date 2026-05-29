import os
import re
import json
import requests
import logging
from datetime import date
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("dtl-scraper")

LLAMABOX_URL = os.getenv("LLAMABOX_URL", "http://10.50.50.203:8000/completion")
MAX_RETRIES = 2
TOKEN_BUDGET = 8192  # Generous budget — we have ~4GB context room on the 3060


def repair_json(raw: str) -> dict | None:
    """
    Attempt multiple strategies to extract valid JSON from LLM output.
    Returns a dict on success, None on total failure.
    """
    # Strategy 1: Direct parse
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Strategy 2: Strip markdown fences and retry
    cleaned = raw.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Strategy 3: Extract the first JSON object with regex
    match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    # Strategy 4: Fix common LLM mistakes
    fixed = cleaned
    # Fix trailing commas before closing brackets/braces
    fixed = re.sub(r',\s*([}\]])', r'\1', fixed)
    # Fix single quotes to double quotes
    fixed = fixed.replace("'", '"')
    # Ensure the string ends with }
    if not fixed.rstrip().endswith('}'):
        fixed = fixed.rstrip() + '}'
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    # Strategy 5: Greedy extraction — find outermost { to last }
    first_brace = cleaned.find('{')
    last_brace = cleaned.rfind('}')
    if first_brace != -1 and last_brace > first_brace:
        candidate = cleaned[first_brace:last_brace + 1]
        # Apply trailing comma fix again
        candidate = re.sub(r',\s*([}\]])', r'\1', candidate)
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    return None


def filter_irrelevant_locations(text: str) -> str:
    """
    Strips out paragraphs that clearly belong to other cities 
    to prevent the LLM from hallucinating those events into London.
    """
    other_cities = ['toronto', 'ottawa', 'hamilton', 'mississauga', 'kitchener', 'waterloo', 'guelph', 'vancouver', 'calgary', 'edmonton', 'montreal', 'halifax', 'winnipeg', 'new york', 'chicago']
    
    paragraphs = text.split('\n')
    filtered = []
    for p in paragraphs:
        p_lower = p.lower()
        mentions_other = any(city in p_lower for city in other_cities)
        mentions_london = 'london' in p_lower
        
        # If it mentions another city but NOT London, it's likely irrelevant location noise
        if mentions_other and not mentions_london:
            continue
            
        filtered.append(p)
        
    return '\n'.join(filtered)


def _call_llamabox(prompt: str, venue_name: str, pass_name: str) -> dict | None:
    """Shared LLM call with retry logic."""
    payload = {
        "prompt": prompt,
        "n_predict": TOKEN_BUDGET,
        "temperature": 0.1
    }

    headers = {}
    api_key = os.getenv("LLAMABOX_API_KEY")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            logger.info(f"[{pass_name}] POSTing to Llamabox for {venue_name} (attempt {attempt}/{MAX_RETRIES})...")
            
            response = requests.post(LLAMABOX_URL, json=payload, headers=headers, timeout=300)
            response.raise_for_status()
            result_text = response.json().get("content", "")

            parsed = repair_json(result_text)
            if parsed is not None:
                return parsed

            logger.warning(f"[{pass_name}] JSON repair failed for {venue_name} on attempt {attempt}. Raw: {result_text[:200]}")

        except requests.exceptions.RequestException as e:
            logger.error(f"[{pass_name}] HTTP error for {venue_name} (attempt {attempt}): {e}")
        except Exception as e:
            logger.error(f"[{pass_name}] Unexpected error for {venue_name} (attempt {attempt}): {e}", exc_info=True)

    logger.error(f"[{pass_name}] All {MAX_RETRIES} attempts failed for {venue_name}. Returning empty.")
    return None


# ═══════════════════════════════════════════════════════════════
# PASS 1: EVENTS & ENTERTAINMENT
# ═══════════════════════════════════════════════════════════════

def extract_events(text_content: str, venue_name: str) -> list:
    """
    Focused extraction: ONLY events and entertainment.
    Returns a list of event dicts, or empty list.
    """
    if not text_content or len(text_content) < 50:
        return []

    text_content = filter_irrelevant_locations(text_content)[:40000]
    today_iso = date.today().isoformat()
    weekday_name = date.today().strftime('%A')

    prompt = f"""You are an event extraction specialist. Your ONLY job is to find entertainment events and recurring entertainment schedules mentioned in the raw text below for a venue called '{venue_name}' in London, Ontario, Canada.

TODAY'S DATE: {today_iso} ({weekday_name})

Read the text VERY CAREFULLY. For each event or recurring entertainment you find, extract:

{{
  "events": [
    {{
      "name": "Event name exactly as written",
      "description": "Full description from the text",
      "days_of_week": ["Monday", "Tuesday"],  // EXACT days mentioned in the text
      "start_time_text": "10pm",              // Time EXACTLY as written in the text
      "start_time": "2026-06-02T22:00:00-04:00",  // Computed ISO 8601 timestamp for next occurrence
      "ticket_url": null,                     // URL if mentioned, else null
      "source_quote": "EXACT sentence or phrase from the raw text that mentions this event — copy it verbatim, character for character"
    }}
  ]
}}

RULES:
1. ONLY extract events that are EXPLICITLY mentioned in the raw text. Do NOT invent events.
2. If the text says NOTHING about entertainment, events, live music, karaoke, trivia, open mic, or any scheduled activities, return: {{"events": []}}
3. Pay EXTREME attention to which days of the week are mentioned. If the text says "Sunday to Tuesday", that means Sunday, Monday, Tuesday — NOT Wednesday. If it says "Wednesday to Saturday", that means Wednesday, Thursday, Friday, Saturday.
4. Copy the source_quote EXACTLY as it appears in the text. This will be verified programmatically.
5. For recurring events, generate concrete entries for the next 2 weeks of occurrences. Calculate the dates carefully based on today being {today_iso} ({weekday_name}).
6. Include the start_time_text field with the EXACT time as written (e.g., "10pm", "9:30 PM", "doors at 8"). This will be cross-referenced.

Return ONLY valid JSON. No markdown, no explanation.

Raw Text:
----------------
{text_content}
----------------

JSON Output:
"""

    result = _call_llamabox(prompt, venue_name, "EVENTS")
    if result and isinstance(result.get("events"), list):
        return result["events"]
    return []


# ═══════════════════════════════════════════════════════════════
# PASS 2: MENU & PRICING
# ═══════════════════════════════════════════════════════════════

def extract_menu(text_content: str, venue_name: str) -> dict:
    """
    Focused extraction: ONLY menu items, prices, and dietary highlights.
    Returns a dict with menu_highlights and pricing_intel.
    """
    if not text_content or len(text_content) < 50:
        return {"menu_highlights": [], "pricing_intel": ""}

    text_content = filter_irrelevant_locations(text_content)[:40000]

    prompt = f"""You are a menu and pricing extraction specialist. Your ONLY job is to find menu items, prices, and dietary information mentioned in the raw text below for a venue called '{venue_name}' in London, Ontario, Canada.

Read the text VERY CAREFULLY and extract:

{{
  "menu_highlights": [
    {{
      "dish": "Exact dish name as written",
      "price": "$14.99",           // Price EXACTLY as written, or null if not mentioned
      "source_quote": "EXACT sentence or phrase from the text mentioning this dish and/or price"
    }}
  ],
  "pricing_intel": "Summary of any general pricing info found (e.g., '$5 Pints on Tuesdays', 'Cover charge $10'). Empty string if none.",
  "dietary_notes": "Any dietary highlights mentioned (GF, vegan options, allergen info). Empty string if none."
}}

RULES:
1. ONLY extract dishes and prices that are EXPLICITLY mentioned in the raw text. Do NOT invent menu items.
2. If prices are mentioned, copy them EXACTLY as written — do not round, estimate, or adjust.
3. Prioritize signature dishes, most-mentioned items, and items with specific prices.
4. Extract up to 5 menu highlights — focus on the most distinctive/signature items.
5. Copy the source_quote EXACTLY as it appears in the text. This will be verified.
6. If the text mentions no food, menu, or prices at all, return empty arrays/strings.

Return ONLY valid JSON. No markdown, no explanation.

Raw Text:
----------------
{text_content}
----------------

JSON Output:
"""

    result = _call_llamabox(prompt, venue_name, "MENU")
    if result:
        return result
    return {"menu_highlights": [], "pricing_intel": ""}


# ═══════════════════════════════════════════════════════════════
# PASS 3: DAILY SPECIALS, VIBE & METADATA
# ═══════════════════════════════════════════════════════════════

def extract_specials_and_vibe(text_content: str, venue_name: str) -> dict:
    """
    Focused extraction: daily specials, happy hours, vibe, and metadata.
    Returns a dict with daily_specials, vibe_analysis, and eventbrite_organizer_id.
    """
    if not text_content or len(text_content) < 50:
        return {"daily_specials": [], "vibe_analysis": "", "eventbrite_organizer_id": None}

    text_content = filter_irrelevant_locations(text_content)[:40000]

    prompt = f"""You are a specials and atmosphere extraction specialist. Your ONLY job is to find daily food/drink specials, happy hours, and characterize the atmosphere from the raw text below for a venue called '{venue_name}' in London, Ontario, Canada.

Read the text VERY CAREFULLY and extract:

{{
  "daily_specials": [
    {{
      "day": "Monday",
      "deal": "Half-price wings",
      "time_window": "5PM-9PM",      // Time window as written, or "All day" if not specified
      "source_quote": "EXACT sentence or phrase from the text mentioning this special"
    }}
  ],
  "vibe_analysis": "A nuanced 2-3 sentence synthesis of the venue's actual atmosphere, personality, and what makes it unique — based on what the text reveals. Go beyond generic descriptions.",
  "eventbrite_organizer_id": null   // If you see an Eventbrite URL like eventbrite.ca/o/some-name-12345, extract ONLY the numeric ID (e.g., "12345"). Otherwise null.
}}

RULES:
1. ONLY extract specials/deals that are EXPLICITLY mentioned in the raw text. Do NOT invent deals.
2. Pay careful attention to which DAY each special applies to. If the text says "Monday & Tuesday: Wing Special", create TWO entries — one for Monday, one for Tuesday.
3. Include the time_window if specified (e.g., "After 5PM", "Until 7pm", "Lunch only"). Use "All day" if no time restriction is mentioned.
4. Copy the source_quote EXACTLY as it appears in the text.
5. For vibe_analysis, synthesize from the actual text content — mentions of decor, crowd, music, food style, history, etc. Be specific and colorful, not generic.

Return ONLY valid JSON. No markdown, no explanation.

Raw Text:
----------------
{text_content}
----------------

JSON Output:
"""

    result = _call_llamabox(prompt, venue_name, "SPECIALS")
    if result:
        return result
    return {"daily_specials": [], "vibe_analysis": "", "eventbrite_organizer_id": None}


# ═══════════════════════════════════════════════════════════════
# CROSS-REFERENCE: Maps Grounding Validation
# ═══════════════════════════════════════════════════════════════

def cross_reference(events: list, maps_data: dict | None, venue_name: str) -> list:
    """
    Cross-reference LLM-extracted events against Maps Grounding Lite data.
    Returns a list of warning strings for discrepancies.
    """
    warnings = []
    if not maps_data:
        return warnings

    maps_summary = (maps_data.get("summary") or "").lower()

    # Check for entertainment types mentioned in Maps but not found by LLM
    entertainment_keywords = {
        "karaoke": "karaoke",
        "trivia": "trivia",
        "live music": "live music",
        "open mic": "open mic",
        "dj": "dj",
        "comedy": "comedy",
        "bingo": "bingo",
    }

    event_names_lower = " ".join(e.get("name", "").lower() for e in events)

    for keyword, label in entertainment_keywords.items():
        in_maps = keyword in maps_summary
        in_events = keyword in event_names_lower

        if in_maps and not in_events and len(events) > 0:
            warnings.append(f"POTENTIAL MISS: Maps mentions '{label}' but no matching event was extracted")
        elif in_maps and not in_events and len(events) == 0:
            warnings.append(f"NOTE: Maps mentions '{label}' but LLM found no events in the scraped text. The website may not list entertainment schedules.")
        elif not in_maps and in_events:
            warnings.append(f"UNCONFIRMED: LLM extracted '{label}' event but Maps doesn't mention it. Verify manually.")

    return warnings


# ═══════════════════════════════════════════════════════════════
# ORCHESTRATOR: Run all passes and merge
# ═══════════════════════════════════════════════════════════════

def synthesize_offerings(text_content: str, venue_name: str) -> dict:
    """
    Multi-pass extraction orchestrator.
    Runs three focused LLM passes and merges results.
    Backward-compatible — returns the same offerings dict structure.
    """
    if not text_content or len(text_content) < 50:
        logger.warning(f"Not enough text to synthesize for {venue_name} (Length: {len(text_content) if text_content else 0})")
        return {}

    logger.info(f"Starting multi-pass extraction for {venue_name} ({len(text_content)} chars of source text)...")

    # Pass 1: Events
    logger.info(f"[PASS 1/3] Extracting events for {venue_name}...")
    events = extract_events(text_content, venue_name)
    logger.info(f"[PASS 1/3] Found {len(events)} candidate events for {venue_name}")

    # Pass 2: Menu
    logger.info(f"[PASS 2/3] Extracting menu for {venue_name}...")
    menu_data = extract_menu(text_content, venue_name)
    highlights = menu_data.get("menu_highlights", [])
    logger.info(f"[PASS 2/3] Found {len(highlights)} menu highlights for {venue_name}")

    # Pass 3: Specials & Vibe
    logger.info(f"[PASS 3/3] Extracting specials & vibe for {venue_name}...")
    specials_data = extract_specials_and_vibe(text_content, venue_name)
    specials = specials_data.get("daily_specials", [])
    logger.info(f"[PASS 3/3] Found {len(specials)} daily specials for {venue_name}")

    # Flatten menu_highlights to the legacy string format for backward compatibility
    if highlights and isinstance(highlights, list):
        flat_highlights = []
        for h in highlights:
            if isinstance(h, dict):
                dish = h.get("dish", "")
                price = h.get("price")
                flat_highlights.append(f"{dish} ({price})" if price else dish)
            elif isinstance(h, str):
                flat_highlights.append(h)
        menu_highlights = flat_highlights
    else:
        menu_highlights = []

    # Flatten daily_specials to legacy format (strip source_quote for storage)
    flat_specials = []
    for s in specials:
        if isinstance(s, dict):
            flat_specials.append({
                "day": s.get("day", ""),
                "deal": s.get("deal", ""),
                "time_window": s.get("time_window", "All day")
            })

    # Merge everything into the offerings structure
    offerings = {
        "menu_highlights": menu_highlights,
        "pricing_intel": menu_data.get("pricing_intel", ""),
        "upcoming_events": events,  # Events still have source_quote for validation in main.py
        "vibe_analysis": specials_data.get("vibe_analysis", ""),
        "daily_specials": flat_specials,
        "eventbrite_organizer_id": specials_data.get("eventbrite_organizer_id"),
    }

    logger.info(f"Multi-pass extraction complete for {venue_name}: {len(events)} events, {len(menu_highlights)} menu items, {len(flat_specials)} specials")
    return offerings
