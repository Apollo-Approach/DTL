from scraper import scrape_venue_data
import logging

logging.basicConfig(level=logging.INFO)

if __name__ == '__main__':
    print("Starting test...")
    venue_name = "The Church Key Bistro-Pub"
    website_url = "https://www.thechurchkey.com"

    text, died = scrape_venue_data(venue_name, website_url)

    print(f"\n--- TEST RESULTS ---")
    print(f"Browser Died: {died}")
    print(f"Text Length: {len(text) if text else 0}")
    print(f"Text Snippet: {text[:200] if text else None}")
