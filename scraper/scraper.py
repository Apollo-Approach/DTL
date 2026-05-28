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


def _is_browser_dead(error):
    """Check if an error indicates the entire browser process has died."""
    dead_signals = ["Connection closed", "Browser closed", "Target closed", "Session closed"]
    return any(sig in str(error) for sig in dead_signals)


def _safe_close_page(page):
    """Close a page without raising if it's already gone."""
    try:
        if page:
            page.close()
    except Exception:
        pass


def _scrape_homepage_camoufox(browser, venue_name, website_url):
    """Phase 1A: Scrape the official homepage using Camoufox.
    Returns (text, page, success). Page is kept open for link hunting."""
    page = None
    try:
        page = browser.new_page()
        page.add_init_script("window.addEventListener('error', function(e) { e.stopImmediatePropagation(); }, true);")
        page.add_init_script("window.addEventListener('unhandledrejection', function(e) { e.stopImmediatePropagation(); }, true);")

        logger.info(f"Visiting official site via Camoufox: {website_url}")
        page.goto(website_url, timeout=30000)
        page.wait_for_load_state("domcontentloaded")

        homepage_text = page.locator("body").inner_text()
        if len(homepage_text) > 50:
            logger.info(f"Successfully extracted {len(homepage_text)} chars from homepage (truncated to 5000).")
            return homepage_text[:5000], page, True, False
        else:
            logger.warning(f"Homepage returned suspiciously little text ({len(homepage_text)} chars).")
            return "", page, True, False  # Page is still alive, just thin content
    except Exception as e:
        logger.warning(f"Camoufox homepage failed for {venue_name}: {e}")
        _safe_close_page(page)
        if _is_browser_dead(e):
            return None, None, False, True  # (text, page, used_camoufox, browser_died)
        return None, None, False, False  # Signal to try curl_cffi fallback


def _scrape_homepage_curl(venue_name, website_url):
    """Phase 1B: Fallback homepage scrape using curl_cffi (no browser needed)."""
    try:
        from curl_cffi import requests
        from bs4 import BeautifulSoup

        resp = requests.get(website_url, impersonate="chrome110", timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')

        for script in soup(["script", "style"]):
            script.extract()

        homepage_text = soup.get_text(separator=' ', strip=True)
        if len(homepage_text) > 50:
            logger.info(f"Successfully extracted {len(homepage_text)} chars from homepage via curl_cffi fallback (truncated to 5000).")
            return homepage_text[:5000], soup
        else:
            logger.warning(f"curl_cffi homepage returned very little text ({len(homepage_text)} chars).")
            return "", soup
    except Exception as e:
        logger.error(f"curl_cffi stealth fallback also failed for {venue_name}: {e}")
        return None, None


def _hunt_deep_links_camoufox(browser, page, website_url, venue_name):
    """Phase 2A: Follow events/menu/specials links from a live Camoufox page."""
    sections = []
    try:
        target_keywords = ['events', 'calendar', 'live music', 'shows', 'menu', 'specials']
        links = page.locator("a").all()
        deep_dive_urls = set()

        for link in links:
            try:
                text = link.inner_text().strip().lower()
                href = link.get_attribute("href")
                if href and any(keyword in text for keyword in target_keywords):
                    if not href.startswith(('javascript:', 'mailto:', 'tel:')):
                        deep_dive_urls.add(href)
            except Exception:
                continue

        if not deep_dive_urls:
            return sections

        from urllib.parse import urljoin
        logger.info(f"Found {len(deep_dive_urls)} potential deep-dive links. Investigating up to 3...")
        dives_completed = 0

        for url in deep_dive_urls:
            if dives_completed >= 3:
                break
            absolute_url = urljoin(website_url, url)
            sub_page = None
            try:
                logger.info(f"Deep-diving into: {absolute_url}")
                sub_page = browser.new_page()
                sub_page.add_init_script("window.addEventListener('error', function(e) { e.stopImmediatePropagation(); }, true);")
                sub_page.add_init_script("window.addEventListener('unhandledrejection', function(e) { e.stopImmediatePropagation(); }, true);")

                sub_page.goto(absolute_url, timeout=20000)
                sub_page.wait_for_load_state("domcontentloaded")
                sub_text = sub_page.locator("body").inner_text()

                if len(sub_text) > 50:
                    sections.append(f"\n--- SUB-PAGE ({absolute_url}) ---\n{sub_text[:5000]}\n")
                    logger.info(f"Extracted {len(sub_text)} chars from sub-page (truncated to 5000).")

                dives_completed += 1
                gentle_sleep()
            except Exception as sub_e:
                logger.warning(f"[SECTION FAILED] Deep dive {absolute_url}: {sub_e}")
                if _is_browser_dead(sub_e):
                    logger.warning("Browser died during deep-dive. Returning what we have so far.")
                    break
            finally:
                _safe_close_page(sub_page)

    except Exception as e:
        logger.warning(f"[SECTION FAILED] Link hunting for {venue_name}: {e}")
        if _is_browser_dead(e):
            raise BrowserDeadError(str(e))

    return sections


def _hunt_deep_links_curl(soup, website_url, venue_name):
    """Phase 2B: Follow events/menu/specials links using curl_cffi (no browser)."""
    sections = []
    try:
        from curl_cffi import requests
        from bs4 import BeautifulSoup
        from urllib.parse import urljoin

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
            except Exception as sub_e:
                logger.warning(f"[SECTION FAILED] curl_cffi deep dive {absolute_url}: {sub_e}")
    except Exception as e:
        logger.warning(f"[SECTION FAILED] curl_cffi link hunting for {venue_name}: {e}")

    return sections


def _scrape_search_engine(browser, venue_name):
    """Phase 3: Scrape DuckDuckGo reviews. Fully independent — uses its own page."""
    page = None
    try:
        search_url = f"https://duckduckgo.com/?q={venue_name.replace(' ', '+')}+london+ontario+reviews"
        logger.info(f"Visiting search engine for {venue_name} reviews: {search_url}")

        page = browser.new_page()
        page.add_init_script("window.addEventListener('error', function(e) { e.stopImmediatePropagation(); }, true);")
        page.add_init_script("window.addEventListener('unhandledrejection', function(e) { e.stopImmediatePropagation(); }, true);")

        page.goto(search_url, timeout=30000)
        page.wait_for_load_state("domcontentloaded")
        text = page.locator("body").inner_text()
        gentle_sleep()
        return text[:5000]
    except Exception as e:
        logger.warning(f"[SECTION FAILED] Search engine scrape for {venue_name}: {e}")
        if _is_browser_dead(e):
            raise BrowserDeadError(str(e))
        return None
    finally:
        _safe_close_page(page)


def scrape_venue_data(venue_name, website_url, browser):
    """Orchestrates all scraping phases for a single venue.
    
    Each phase is fully independent with its own error boundary.
    If a section fails, it is tagged as [SECTION FAILED] in the logs
    and processing continues to the next phase.
    """
    aggregated_text = ""
    logger.info(f"Starting Camoufox scrape for {venue_name}...")

    # ---- PHASE 1: Homepage ----
    homepage_page = None  # Track the Camoufox page for link hunting
    homepage_soup = None  # Track the curl_cffi soup for link hunting
    used_camoufox = False
    browser_died = False

    if website_url:
        # Try Camoufox first
        homepage_text, homepage_page, used_camoufox, browser_died_homepage = _scrape_homepage_camoufox(browser, venue_name, website_url)
        browser_died = browser_died or browser_died_homepage

        if homepage_text is None:
            # Camoufox failed (but browser is still alive), try curl_cffi
            homepage_text, homepage_soup = _scrape_homepage_curl(venue_name, website_url)
            if homepage_text:
                aggregated_text += f"\n--- OFFICIAL WEBSITE (REQUESTS FALLBACK) ---\n{homepage_text}\n"
        elif homepage_text:
            aggregated_text += f"\n--- OFFICIAL WEBSITE (HOMEPAGE) ---\n{homepage_text}\n"

        # ---- PHASE 2: Deep-dive sub-pages ----
        if used_camoufox and homepage_page:
            try:
                sub_sections = _hunt_deep_links_camoufox(browser, homepage_page, website_url, venue_name)
                aggregated_text += "".join(sub_sections)
            except BrowserDeadError:
                logger.warning("Browser died during deep-dive phase. Continuing with fallback.")
                browser_died = True
                _safe_close_page(homepage_page)
            finally:
                _safe_close_page(homepage_page)
        elif homepage_soup:
            sub_sections = _hunt_deep_links_curl(homepage_soup, website_url, venue_name)
            aggregated_text += "".join(sub_sections)

        # ---- PHASE 2.5: PDF Menu Extraction ----
        try:
            from pdf_extractor import find_pdf_links, extract_pdf_text
            
            # Get the raw HTML to scan for PDF links
            raw_html = None
            try:
                from curl_cffi import requests as cffi_requests
                resp = cffi_requests.get(website_url, impersonate="chrome110", timeout=15)
                raw_html = resp.text
            except Exception:
                pass
            
            # Also check common menu/specials sub-pages for PDFs
            if raw_html:
                pdf_urls = find_pdf_links(raw_html, website_url)
                
                # Also probe known sub-page patterns for PDF links
                from urllib.parse import urljoin
                sub_page_patterns = ["menu", "the-menu", "specials", "daily-specials", "food-menu", "drinks"]
                for pattern in sub_page_patterns:
                    for ext in [".html", "", "/"]:
                        probe_url = urljoin(website_url, f"{pattern}{ext}")
                        try:
                            probe_resp = cffi_requests.get(probe_url, impersonate="chrome110", timeout=10)
                            if probe_resp.status_code == 200:
                                pdf_urls.extend(find_pdf_links(probe_resp.text, probe_url))
                        except Exception:
                            continue
                
                # Deduplicate
                pdf_urls = list(set(pdf_urls))
                
                if pdf_urls:
                    logger.info(f"Found {len(pdf_urls)} PDF link(s) for {venue_name}. Extracting...")
                    for pdf_url in pdf_urls[:3]:  # Max 3 PDFs per venue
                        pdf_text = extract_pdf_text(pdf_url, venue_name)
                        if pdf_text:
                            aggregated_text += f"\n--- MENU PDF ({pdf_url}) ---\n{pdf_text}\n"
        except Exception as pdf_e:
            logger.warning(f"[SECTION FAILED] PDF extraction for {venue_name}: {pdf_e}")

    # ---- PHASE 3: Fallback Search (DuckDuckGo) ----
    if not browser_died:
        try:
            search_text = _scrape_search_engine(browser, venue_name)
            if search_text:
                aggregated_text += f"\n--- AGGREGATOR REVIEWS (DUCKDUCKGO) ---\n{search_text}\n"
        except BrowserDeadError:
            logger.warning("Browser died during search phase. Returning what we have.")
            browser_died = True
    else:
        logger.warning(f"Skipping search phase for {venue_name} because browser is already dead.")

    if not aggregated_text.strip():
        logger.warning(f"Failed to extract any text for {venue_name} across all phases.")
        return None, browser_died

    return aggregated_text, browser_died
