import time
import random
import logging

logger = logging.getLogger("dtl-scraper")

def gentle_sleep():
    delay = random.uniform(8, 22)
    logger.info(f"Sleeping for {delay:.2f} seconds to mimic human behavior...")
    time.sleep(delay)

def scrape_venue_data(venue_name, website_url, browser):
    aggregated_text = ""
    logger.info(f"Starting Camoufox scrape for {venue_name}...")

    try:
        # Open a new tab instead of booting a whole new browser
        page = browser.new_page()

        if website_url:
            logger.info(f"Visiting official site: {website_url}")
            try:
                page.goto(website_url, timeout=30000)
                page.wait_for_load_state("networkidle", timeout=15000)
                text = page.locator("body").inner_text()
                aggregated_text += f"\n--- OFFICIAL WEBSITE ---\n{text}\n"
                gentle_sleep()
            except Exception as e:
                logger.warning(f"Failed to scrape official site for {venue_name}: {e}")

        search_url = f"https://duckduckgo.com/?q={venue_name.replace(' ', '+')}+london+ontario+reviews"
        logger.info(f"Visiting search engine for {venue_name} reviews: {search_url}")
        try:
            page.goto(search_url, timeout=30000)
            page.wait_for_load_state("domcontentloaded")
            text = page.locator("body").inner_text()
            aggregated_text += f"\n--- SEARCH RESULTS ---\n{text}\n"
            gentle_sleep()
        except Exception as e:
            logger.warning(f"Failed to scrape search engine for {venue_name}: {e}")

        # Close the tab to free memory
        page.close()

    except Exception as e:
        logger.error(f"Camoufox browser failure: {e}", exc_info=True)

    return aggregated_text
