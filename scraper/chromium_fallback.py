import sys
import time
from playwright.sync_api import sync_playwright

def main():
    if len(sys.argv) < 2:
        return
    website_url = sys.argv[1]
    fallback_text = ""
    try:
        with sync_playwright() as p:
            cr_browser = p.chromium.launch(headless=True)
            cr_page = cr_browser.new_page()
            cr_page.goto(website_url, timeout=30000)
            cr_page.wait_for_load_state("domcontentloaded")
            
            homepage_text = cr_page.locator("body").inner_text()
            if len(homepage_text) > 50:
                fallback_text += f"\n--- OFFICIAL WEBSITE (CHROMIUM FALLBACK) ---\n{homepage_text[:15000]}\n"
            
            target_keywords = ['events', 'calendar', 'live music', 'shows', 'menu', 'specials']
            links = cr_page.locator("a").all()
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
                from urllib.parse import urljoin
                for url in deep_dive_urls:
                    if dives_completed >= max_deep_dives:
                        break
                    absolute_url = urljoin(website_url, url)
                    try:
                        cr_sub = cr_browser.new_page()
                        cr_sub.goto(absolute_url, timeout=20000)
                        cr_sub.wait_for_load_state("domcontentloaded")
                        sub_text = cr_sub.locator("body").inner_text()
                        if len(sub_text) > 50:
                            fallback_text += f"\n--- SUB-PAGE ({absolute_url}) ---\n{sub_text[:15000]}\n"
                        cr_sub.close()
                        dives_completed += 1
                        time.sleep(2)
                    except Exception:
                        pass
            cr_browser.close()
    except Exception:
        pass
        
    print(fallback_text)

if __name__ == '__main__':
    main()
