import os
import json
import requests
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("dtl-scraper")

LLAMABOX_URL = os.getenv("LLAMABOX_URL", "http://10.50.50.203:8000/completion")

def synthesize_offerings(text_content, venue_name):
    if not text_content or len(text_content) < 50:
        logger.warning(f"Not enough text to synthesize for {venue_name} (Length: {len(text_content) if text_content else 0})")
        return {}

    text_content = text_content[:8000]

    prompt = f"""You are a helpful data extraction assistant. I will provide you with the raw text from the website of a venue named '{venue_name}'.
Your job is to read the text and extract their offerings into a strict JSON format. 

Here are the exact string options you must choose from for each array:
- drinks: ["Beer", "Wine", "Cocktails", "Mocktails"]
- cuisine: ["Quick Bites / Tapas", "Sit-down Dinner", "Street Food / Popups", "None, just drinks"]
- vibe: ["Live Bands", "DJs / Electronic", "Chill Lounge", "High Energy"]
- habits.affordability: "$" or "$$" or "$$$" or "$$$$"

Return ONLY valid JSON. Do not include markdown formatting or extra text.
If a category is unknown, leave the array empty. If affordability is unknown, omit it.

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

    try:
        logger.info(f"POSTing to Llamabox for {venue_name}...")
        response = requests.post(LLAMABOX_URL, json=payload, timeout=60)
        response.raise_for_status()
        result_text = response.json().get("content", "") + "}"
        
        result_text = result_text.replace("```json", "").replace("```", "").strip()
        
        return json.loads(result_text)
    except Exception as e:
        logger.error(f"Error during LLM synthesis for {venue_name}: {e}", exc_info=True)
        return {}
