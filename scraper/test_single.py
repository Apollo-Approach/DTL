import sys
from scraper import scrape_venue_data
from llm_client import synthesize_offerings
from camoufox.sync_api import Camoufox

venue_name = "Crabby Joe's"
website_url = "https://www.crabbyjoes.com/"

print(f"Testing {venue_name} at {website_url}")
with Camoufox(headless=True) as browser:
    raw_text = scrape_venue_data(venue_name, website_url, browser)
    print(f"Raw text length: {len(raw_text)}")
    print("Synthesizing...")
    res = synthesize_offerings(raw_text, venue_name)
    print("Result:")
    print(res)
