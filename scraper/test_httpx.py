import httpx
from bs4 import BeautifulSoup
import sys

url = "https://londonmusichall.com/"
try:
    r = httpx.get(url, timeout=10, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    soup = BeautifulSoup(r.text, 'html.parser')
    print("LMH extracted text length:", len(soup.get_text(separator=' ', strip=True)))
except Exception as e:
    print("LMH error:", e)

url = "https://www.budweisergardens.com/"
try:
    r = httpx.get(url, timeout=10, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    soup = BeautifulSoup(r.text, 'html.parser')
    print("Bud Gardens extracted text length:", len(soup.get_text(separator=' ', strip=True)))
except Exception as e:
    print("Bud Gardens error:", e)

