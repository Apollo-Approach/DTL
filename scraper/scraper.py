import time
import random
import logging
from bs4 import BeautifulSoup
from urllib.parse import urljoin

logger = logging.getLogger("dtl-scraper")

def gentle_sleep():
    delay = random.uniform(8, 22)
    logger.info(f"Sleeping for {delay:.2f} seconds to mimic human behavior...")
    time.sleep(delay)

def _check_parked_domain(website_url):
    """Pre-flight check to see if a domain is parked/squatted."""
    if not website_url:
        return False
    try:
        from curl_cffi import requests
        resp = requests.get(website_url, impersonate="chrome110", timeout=5, allow_redirects=True)
        final_url = resp.url.lower()
        
        known_squatters = ["hugedomains.com", "sedo.com", "dan.com", "domainmarket.com", "godaddy.com/forsale"]
        if any(squatter in final_url for squatter in known_squatters):
            return True
            
        soup = BeautifulSoup(resp.text, 'html.parser')
        title = soup.title.string.lower() if soup.title and soup.title.string else ""
        
        parked_keywords = ["domain is for sale", "buy this domain", "this domain is parked"]
        if any(keyword in title for keyword in parked_keywords):
            return True
            
        return False
    except Exception:
        return False


def _scrape_homepage_curl(venue_name, website_url):
    """Phase 1: Fast homepage scrape using curl_cffi."""
    try:
        from curl_cffi import requests
        resp = requests.get(website_url, impersonate="chrome110", timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')

        for script in soup(["script", "style"]):
            script.extract()

        homepage_text = soup.get_text(separator=' ', strip=True)
        if len(homepage_text) > 50:
            logger.info(f"Successfully extracted {len(homepage_text)} chars from homepage via curl_cffi (truncated to 5000).")
            return homepage_text[:5000], soup, resp.text
        else:
            logger.warning(f"curl_cffi homepage returned very little text ({len(homepage_text)} chars). Likely an SPA.")
            return "", soup, resp.text
    except Exception as e:
        logger.warning(f"curl_cffi homepage scrape failed for {venue_name}: {e}")
        return None, None, None


def _browserless_single_page(url, venue_name):
    """Render a single page via browserless and extract its text content."""
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp("ws://browserless:3000")
            page = browser.new_page()
            page.goto(url, timeout=20000)
            page.wait_for_load_state("domcontentloaded", timeout=10000)
            text = page.locator("body").inner_text()
            page.close()
            browser.close()
            logger.info(f"Browserless single-page extracted {len(text)} chars from {url}")
            return text[:5000]
    except Exception as e:
        logger.warning(f"Browserless single-page fallback failed for {url}: {e}")
        return None


def _hunt_deep_links_curl(soup, website_url, venue_name):
    """Phase 2: Fast link hunting using curl_cffi, with browserless fallback for JS-rendered sub-pages."""
    sections = []
    if not soup:
        return sections
        
    try:
        from curl_cffi import requests

        target_keywords = ['events', 'calendar', 'live music', 'shows', 'menu', 'specials']
        deep_dive_urls = set()

        for a in soup.find_all('a', href=True):
            text = a.get_text().strip().lower()
            href = a.get('href')
            if href and any(keyword in text for keyword in target_keywords):
                if not href.startswith(('javascript:', 'mailto:', 'tel:')):
                    deep_dive_urls.add(href)

        dives_completed = 0
        for url in deep_dive_urls:
            if dives_completed >= 3:
                break
            absolute_url = urljoin(website_url, url)
            try:
                sub_resp = requests.get(absolute_url, impersonate="chrome110", timeout=15)
                sub_resp.raise_for_status()
                sub_soup = BeautifulSoup(sub_resp.text, 'html.parser')
                for script in sub_soup(["script", "style"]):
                    script.extract()
                sub_text = sub_soup.get_text(separator=' ', strip=True)
                if len(sub_text) > 50:
                    sections.append(f"\n--- SUB-PAGE ({absolute_url}) ---\n{sub_text[:5000]}\n")
                    dives_completed += 1
                    gentle_sleep()
                else:
                    # JS-rendered sub-page — try browserless fallback
                    logger.info(f"Deep link {absolute_url} returned only {len(sub_text)} chars via curl. Trying browserless...")
                    bl_text = _browserless_single_page(absolute_url, venue_name)
                    if bl_text and len(bl_text) > 50:
                        sections.append(f"\n--- SUB-PAGE ({absolute_url}) [BROWSERLESS] ---\n{bl_text[:5000]}\n")
                    dives_completed += 1
                    gentle_sleep()
            except Exception as sub_e:
                logger.warning(f"[SECTION FAILED] curl_cffi deep dive {absolute_url}: {sub_e}")
    except Exception as e:
        logger.warning(f"[SECTION FAILED] curl_cffi link hunting for {venue_name}: {e}")

    return sections


def _scrape_spa_fallback(venue_name, website_url):
    """Phase 1B & 2B: Fallback to browserless/chrome for SPAs via Playwright WebSockets."""
    sections = []
    homepage_text = ""
    browser_died = False
    
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            # Connect to our isolated browserless container
            logger.info(f"Connecting to isolated browserless container for SPA fallback: {website_url}")
            browser = p.chromium.connect_over_cdp("ws://browserless:3000")
            page = browser.new_page()
            
            # Navigate
            page.goto(website_url, timeout=30000)
            page.wait_for_load_state("networkidle", timeout=15000)
            
            homepage_text = page.locator("body").inner_text()
            logger.info(f"Browserless extracted {len(homepage_text)} chars from homepage.")
            
            # Deep dive links directly via JS evaluation to avoid DOM click deadlocks
            target_keywords = ['events', 'calendar', 'live music', 'shows', 'menu', 'specials']
            links = page.evaluate("""() => {
                return Array.from(document.querySelectorAll('a')).map(a => ({href: a.href, text: a.innerText}));
            }""")
            
            deep_dive_urls = set()
            for link in links:
                text = (link.get('text') or "").strip().lower()
                href = link.get('href')
                if href and any(keyword in text for keyword in target_keywords):
                    if not href.startswith(('javascript:', 'mailto:', 'tel:')):
                        deep_dive_urls.add(href)
            
            dives_completed = 0
            for url in deep_dive_urls:
                if dives_completed >= 3:
                    break
                try:
                    sub_page = browser.new_page()
                    sub_page.goto(url, timeout=20000)
                    sub_page.wait_for_load_state("domcontentloaded", timeout=10000)
                    sub_text = sub_page.locator("body").inner_text()
                    if len(sub_text) > 50:
                        sections.append(f"\n--- SUB-PAGE ({url}) ---\n{sub_text[:5000]}\n")
                    sub_page.close()
                    dives_completed += 1
                except Exception as e:
                    logger.warning(f"Browserless deep dive failed for {url}: {e}")
                    
            browser.close()
            
    except Exception as e:
        logger.error(f"Browserless fallback completely failed for {venue_name}: {e}")
        browser_died = True
        
    return homepage_text[:5000], sections, browser_died


def _scrape_search_engine_curl(venue_name):
    """Phase 3: Fast DDG scrape using curl_cffi."""
    try:
        from curl_cffi import requests
        search_url = f"https://html.duckduckgo.com/html/?q={venue_name.replace(' ', '+')}+london+ontario+reviews"
        logger.info(f"Visiting DDG via curl_cffi: {search_url}")
        
        resp = requests.get(search_url, impersonate="chrome110", timeout=15)
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        # Extract just the snippet results
        results = soup.find_all('a', class_='result__snippet')
        texts = [res.get_text(strip=True) for res in results]
        
        if texts:
            return " ".join(texts)[:5000]
        return None
    except Exception as e:
        logger.warning(f"curl_cffi search engine failed for {venue_name}: {e}")
        return None


def scrape_venue_data(venue_name, website_url):
    """Orchestrates all scraping phases for a single venue using Fast-First strategy."""
    aggregated_text = ""
    logger.info(f"Starting Fast-First scrape for {venue_name}...")
    browser_died = False

    # Pre-flight Check
    if _check_parked_domain(website_url):
        logger.warning(f"Aborting scrape for {venue_name}: Detected parked/squatted domain ({website_url})")
        return None, True, True  # return text, browser_died, is_parked

    raw_html = None
    if website_url:
        # Phase 1 & 2: Fast curl_cffi scrape
        homepage_text, soup, raw_html = _scrape_homepage_curl(venue_name, website_url)
        
        if homepage_text and len(homepage_text) > 50:
            aggregated_text += f"\n--- OFFICIAL WEBSITE (CURL) ---\n{homepage_text}\n"
            sub_sections = _hunt_deep_links_curl(soup, website_url, venue_name)
            aggregated_text += "".join(sub_sections)
        else:
            # Fallback to Browserless SPA rendering
            logger.info(f"curl_cffi failed to get meaningful text for {venue_name}. Falling back to Browserless SPA rendering...")
            spa_text, spa_sections, spa_browser_died = _scrape_spa_fallback(venue_name, website_url)
            browser_died = spa_browser_died
            if spa_text:
                aggregated_text += f"\n--- OFFICIAL WEBSITE (SPA FALLBACK) ---\n{spa_text}\n"
            aggregated_text += "".join(spa_sections)

        # Phase 2.5: PDF Menu Extraction (Always runs off raw_html or probes)
        try:
            from pdf_extractor import find_pdf_links, extract_pdf_text
            pdf_urls = []
            if raw_html:
                pdf_urls = find_pdf_links(raw_html, website_url)
            
            # Also probe common endpoints via curl
            from curl_cffi import requests as cffi_requests
            sub_page_patterns = ["menu", "the-menu", "specials", "daily-specials", "food-menu", "drinks"]
            for pattern in sub_page_patterns:
                for ext in [".html", "", "/"]:
                    probe_url = urljoin(website_url, f"{pattern}{ext}")
                    try:
                        probe_resp = cffi_requests.get(probe_url, impersonate="chrome110", timeout=5)
                        if probe_resp.status_code == 200:
                            pdf_urls.extend(find_pdf_links(probe_resp.text, probe_url))
                    except Exception:
                        continue
            
            pdf_urls = list(set(pdf_urls))
            if pdf_urls:
                logger.info(f"Found {len(pdf_urls)} PDF link(s) for {venue_name}. Extracting...")
                for pdf_url in pdf_urls[:3]:  
                    pdf_text = extract_pdf_text(pdf_url, venue_name)
                    if pdf_text:
                        aggregated_text += f"\n--- MENU PDF ({pdf_url}) ---\n{pdf_text}\n"
        except Exception as pdf_e:
            logger.warning(f"[SECTION FAILED] PDF extraction for {venue_name}: {pdf_e}")

    # Phase 3: Fast DDG Scrape
    search_text = _scrape_search_engine_curl(venue_name)
    if search_text:
        aggregated_text += f"\n--- AGGREGATOR REVIEWS (DUCKDUCKGO) ---\n{search_text}\n"

    if not aggregated_text.strip():
        logger.warning(f"Failed to extract any text for {venue_name} across all phases.")
        return None, browser_died, False
        
    return aggregated_text, browser_died, False
