import time
import random
import logging

logger = logging.getLogger("dtl-scraper")

def gentle_sleep():
    delay = random.uniform(8, 22)
    logger.info(f"Sleeping for {delay:.2f} seconds to mimic human behavior...")
    time.sleep(delay)

class BrowserDeadError(Exception):
    pass

def scrape_venue_data(venue_name, website_url, browser):
    aggregated_text = ""
    logger.info(f"Starting Camoufox scrape for {venue_name}...")

    try:
        # Open a new tab instead of booting a whole new browser
        page = browser.new_page()

        if website_url:
            logger.info(f"Visiting official site via requests (safe mode): {website_url}")
            try:
                import requests
                from bs4 import BeautifulSoup
                
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
                response = requests.get(website_url, headers=headers, timeout=15)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Remove script and style elements
                for script in soup(["script", "style"]):
                    script.extract()
                    
                text = soup.get_text(separator=' ', strip=True)
                if len(text) > 50:
                    aggregated_text += f"\n--- OFFICIAL WEBSITE ---\n{text[:15000]}\n"
                    logger.info(f"Successfully extracted {len(text)} chars from official site via safe mode.")
                else:
                    logger.warning(f"Safe mode returned suspiciously little text ({len(text)} chars).")
                    
                gentle_sleep()
            except Exception as e:
                logger.warning(f"Failed to scrape official site via safe mode for {venue_name}: {e}")

        # Close the page and open a fresh one to prevent "navigation interrupted" errors if the previous site hung
        page.close()
        page = browser.new_page()

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
            if "Connection closed" in str(e):
                raise BrowserDeadError(str(e))

        # Close the tab to free memory
        page.close()

    except BrowserDeadError:
        raise
    except Exception as e:
        logger.error(f"Camoufox browser failure: {e}", exc_info=True)
        if "Connection closed" in str(e):
            raise BrowserDeadError(str(e))

    return aggregated_text
