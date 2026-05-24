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


def synthesize_offerings(text_content, venue_name):
    if not text_content or len(text_content) < 50:
        logger.warning(f"Not enough text to synthesize for {venue_name} (Length: {len(text_content) if text_content else 0})")
        return {}

    text_content = text_content[:8000]

    prompt = f"""You are a deep-dive data extraction assistant. I will provide you with the raw text from the website and search results of a venue named '{venue_name}'.
Your job is to read the text and extract hyper-specific, dynamic information into a strict JSON format. 

Extract the following structure:
- "menu_highlights": [Array of 2-3 signature dishes, specific craft drinks, or dietary highlights mentioned]
- "pricing_intel": [String describing specific prices found, e.g., "$5 Pints on Tuesdays" or "Cover charge $10". Leave empty if none]
- "upcoming_events": [Array of specific events or recurring themes like "Trivia on Tuesdays" or "Live DJ". Leave empty if none]
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
        "n_predict": 512,
        "temperature": 0.1,
        "stop": ["}"]
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
            result_text = response.json().get("content", "") + "}"

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
