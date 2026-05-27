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
        # Inject anti-crash error suppressors before any navigation occurs
        page.add_init_script("window.addEventListener('error', function(e) { e.stopImmediatePropagation(); }, true);")
        page.add_init_script("window.addEventListener('unhandledrejection', function(e) { e.stopImmediatePropagation(); }, true);")

        if website_url:
            logger.info(f"Visiting official site via Camoufox: {website_url}")
            try:
                page.goto(website_url, timeout=30000)
                page.wait_for_load_state("domcontentloaded")
                
                homepage_text = page.locator("body").inner_text()
                if len(homepage_text) > 50:
                    aggregated_text += f"\n--- OFFICIAL WEBSITE (HOMEPAGE) ---\n{homepage_text[:5000]}\n"
                    logger.info(f"Successfully extracted {len(homepage_text)} chars from homepage (truncated to 5000).")
                else:
                    logger.warning(f"Homepage returned suspiciously little text ({len(homepage_text)} chars).")
                
                # Deep-Dive Link Hunting
                target_keywords = ['events', 'calendar', 'live music', 'shows', 'menu', 'specials']
                links = page.locator("a").all()
                deep_dive_urls = set()
                
                for link in links:
                    try:
                        text = link.inner_text().strip().lower()
                        href = link.get_attribute("href")
                        if href and any(keyword in text for keyword in target_keywords):
                            if not href.startswith('javascript:') and not href.startswith('mailto:') and not href.startswith('tel:'):
                                deep_dive_urls.add(href)
                    except Exception:
                        continue
                
                max_deep_dives = 3
                dives_completed = 0
                
                if deep_dive_urls:
                    logger.info(f"Found {len(deep_dive_urls)} potential deep-dive links. Investigating up to {max_deep_dives}...")
                    from urllib.parse import urljoin
                    
                    for url in deep_dive_urls:
                        if dives_completed >= max_deep_dives:
                            break
                        
                        absolute_url = urljoin(website_url, url)
                        logger.info(f"Deep-diving into: {absolute_url}")
                        
                        try:
                            sub_page = browser.new_page()
                            sub_page.add_init_script("window.addEventListener('error', function(e) { e.stopImmediatePropagation(); }, true);")
                            sub_page.add_init_script("window.addEventListener('unhandledrejection', function(e) { e.stopImmediatePropagation(); }, true);")
                            
                            sub_page.goto(absolute_url, timeout=20000)
                            sub_page.wait_for_load_state("domcontentloaded")
                            sub_text = sub_page.locator("body").inner_text()
                            
                            if len(sub_text) > 50:
                                aggregated_text += f"\n--- SUB-PAGE ({absolute_url}) ---\n{sub_text[:5000]}\n"
                                logger.info(f"Extracted {len(sub_text)} chars from sub-page (truncated to 5000).")
                            
                            sub_page.close()
                            dives_completed += 1
                            gentle_sleep()
                        except Exception as sub_e:
                            logger.warning(f"Failed to deep dive {absolute_url}: {sub_e}")
                            
            except Exception as e:
                logger.warning(f"Failed to scrape official site via Camoufox for {venue_name}: {e}. Falling back to curl_cffi stealth requests.")
                try:
                    from curl_cffi import requests
                    from bs4 import BeautifulSoup
                    from urllib.parse import urljoin
                    
                    # Use curl_cffi to impersonate a real browser TLS fingerprint
                    resp = requests.get(website_url, impersonate="chrome110", timeout=15)
                    resp.raise_for_status()
                    soup = BeautifulSoup(resp.text, 'html.parser')
                    
                    for script in soup(["script", "style"]):
                        script.extract()
                        
                    homepage_text = soup.get_text(separator=' ', strip=True)
                    if len(homepage_text) > 50:
                        aggregated_text += f"\n--- OFFICIAL WEBSITE (REQUESTS FALLBACK) ---\n{homepage_text[:5000]}\n"
                        logger.info(f"Successfully extracted {len(homepage_text)} chars from homepage via curl_cffi fallback (truncated to 5000).")
                        
                    target_keywords = ['events', 'calendar', 'live music', 'shows', 'menu', 'specials']
                    deep_dive_urls = set()
                    
                    for a in soup.find_all('a', href=True):
                        text = a.get_text().strip().lower()
                        href = a.get('href')
                        if href and any(keyword in text for keyword in target_keywords):
                            if not href.startswith('javascript:') and not href.startswith('mailto:') and not href.startswith('tel:'):
                                deep_dive_urls.add(href)
                                
                    max_deep_dives = 3
                    dives_completed = 0
                    
                    if deep_dive_urls:
                        for url in deep_dive_urls:
                            if dives_completed >= max_deep_dives:
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
                                    aggregated_text += f"\n--- SUB-PAGE ({absolute_url}) ---\n{sub_text[:5000]}\n"
                                dives_completed += 1
                                gentle_sleep()
                            except Exception as sub_e:
                                logger.warning(f"curl_cffi fallback failed to deep dive {absolute_url}: {sub_e}")
                                
                except Exception as fallback_e:
                    logger.error(f"curl_cffi stealth fallback also failed for {venue_name}: {fallback_e}")
            
            if "Connection closed" in str(e):
                logger.warning("Camoufox driver is dead. Returning fallback text immediately and skipping DuckDuckGo.")
                return aggregated_text
                    
        # Close the page and open a fresh one to prevent "navigation interrupted" errors if the previous site hung
        try:
            page.close()
        except Exception:
            pass
        page = browser.new_page()

        search_url = f"https://duckduckgo.com/?q={venue_name.replace(' ', '+')}+london+ontario+reviews"
        logger.info(f"Visiting search engine for {venue_name} reviews: {search_url}")
        try:
            page.goto(search_url, timeout=30000)
            page.wait_for_load_state("domcontentloaded")
            text = page.locator("body").inner_text()
            aggregated_text += f"\n--- SEARCH RESULTS ---\n{text[:5000]}\n"
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
