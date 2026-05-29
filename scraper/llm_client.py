import os
import re
import json
import requests
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("dtl-scraper")

LLAMABOX_URL = os.getenv("LLAMABOX_URL", "http://10.50.50.203:8000/completion")

MAX_RETRIES = 2


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

def synthesize_offerings(text_content, venue_name):
    if not text_content or len(text_content) < 50:
        logger.warning(f"Not enough text to synthesize for {venue_name} (Length: {len(text_content) if text_content else 0})")
        return {}

    # Pre-filter the raw text to strip out blocks meant for other cities
    text_content = filter_irrelevant_locations(text_content)
    text_content = text_content[:40000]

    today_iso = __import__('datetime').date.today().isoformat()
    weekday_name = __import__('datetime').date.today().strftime('%A')

    prompt = f"""You are a deep-dive data extraction assistant. I will provide you with the raw text from the website and search results of a venue named '{venue_name}'.
Your job is to read the text and extract hyper-specific, dynamic information into a strict JSON format. 

CRITICAL LOCALIZATION CONTEXT: This venue is exclusively located in London, Ontario, Canada.
Focus entirely on extracting events, specials, and menu items that explicitly apply to the London, Ontario location or are brand-wide offerings. 
Ensure all extracted data is strictly relevant to a customer visiting the London venue today.

TODAY'S DATE: {today_iso} ({weekday_name})

Extract the following structure:
- "menu_highlights": [Array of 2-3 signature dishes, specific craft drinks, or dietary highlights mentioned]
- "pricing_intel": [String describing specific prices found, e.g., "$5 Pints on Tuesdays" or "Cover charge $10". Leave empty if none]
- "upcoming_events": [Array of specific events. Each object must have "name", "description", "start_time" (ISO 8601 timestamp), "ticket_url" (if mentioned, else null), and "source_quote" (the EXACT sentence or phrase from the raw text that mentions this event — copy it verbatim).
  CRITICAL: ONLY extract events that are EXPLICITLY mentioned in the raw text. Do NOT invent, assume, or hallucinate events. If the text does not mention trivia, karaoke, open mic, live music, or any other recurring event by name, do NOT create one. An empty array is the correct answer when no events are mentioned.
  For RECURRING weekly events that ARE explicitly mentioned in the text (e.g., the text says "Trivia every Tuesday" or "Karaoke Fridays"), generate concrete event entries using the NEXT occurrences relative to today ({today_iso}). Calculate the correct dates and output them as ISO 8601 timestamps like "2026-06-03T19:00:00-04:00". Generate entries for the next 2 weeks of recurring events.
  For one-time events with a specific date, use that date directly.
  Leave empty array if no events are explicitly mentioned in the text.]
- "vibe_analysis": [A short, 1-2 sentence nuanced synthesis of the venue's actual atmosphere based on the text]
- "daily_specials": [Array of objects with "day" (e.g., "Monday"), "deal" (e.g., "Half-price wings"), and "time_window" (e.g., "5PM-9PM" or "All day"). Extract any recurring food/drink specials, happy hours, or daily deals. Leave empty array if none found.]
- "eventbrite_organizer_id": [If you see an Eventbrite URL for the venue's events (e.g. eventbrite.ca/o/some-name-12345), extract the NUMERIC ID at the end of the URL (e.g. "12345"). Leave null if none found.]

Return ONLY valid JSON. Do not include markdown formatting or extra text.
If a category is unknown, leave it empty or null.

Raw Text:
----------------
{text_content}
----------------

JSON Output:
"""

    payload = {
        "prompt": prompt,
        "n_predict": 8192,
        "temperature": 0.1
    }

    headers = {}
    api_key = os.getenv("LLAMABOX_API_KEY")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            logger.info(f"POSTing to Llamabox for {venue_name} (attempt {attempt}/{MAX_RETRIES})...")
            
            response = requests.post(LLAMABOX_URL, json=payload, headers=headers, timeout=300)
            response.raise_for_status()
            result_text = response.json().get("content", "")

            parsed = repair_json(result_text)
            if parsed is not None:
                return parsed

            logger.warning(f"JSON repair failed for {venue_name} on attempt {attempt}. Raw: {result_text[:200]}")

        except requests.exceptions.RequestException as e:
            logger.error(f"HTTP error during LLM synthesis for {venue_name} (attempt {attempt}): {e}")
        except Exception as e:
            logger.error(f"Unexpected error during LLM synthesis for {venue_name} (attempt {attempt}): {e}", exc_info=True)

    logger.error(f"All {MAX_RETRIES} attempts failed for {venue_name}. Returning empty.")
    return None
