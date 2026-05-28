"""
PDF Menu Extraction Module for the DTL Scraper.

Strategy:
  1. PyMuPDF (fitz) for text-based PDFs — fast, free, zero API calls.
  2. Gemini Vision API fallback for image-only PDFs — modern multimodal OCR.

Usage:
  text = extract_pdf_text(pdf_url)
  if text:
      aggregated_text += f"\\n--- MENU PDF ---\\n{text}\\n"
"""

import os
import io
import re
import logging
import base64
import requests as stdlib_requests

logger = logging.getLogger("dtl-scraper")

# Minimum chars from PyMuPDF before we consider the PDF "text-based"
TEXT_PDF_THRESHOLD = 100


def _download_pdf(pdf_url: str) -> bytes | None:
    """Download a PDF with curl_cffi for stealth, fallback to stdlib requests."""
    try:
        from curl_cffi import requests
        resp = requests.get(pdf_url, impersonate="chrome110", timeout=20)
        resp.raise_for_status()
        if len(resp.content) < 500:
            logger.warning(f"PDF suspiciously small ({len(resp.content)} bytes): {pdf_url}")
            return None
        return resp.content
    except Exception as e:
        logger.warning(f"curl_cffi PDF download failed: {e}. Trying stdlib requests...")
        try:
            resp = stdlib_requests.get(pdf_url, timeout=20)
            resp.raise_for_status()
            return resp.content
        except Exception as e2:
            logger.error(f"PDF download completely failed for {pdf_url}: {e2}")
            return None


def _extract_text_pymupdf(pdf_bytes: bytes) -> str:
    """Extract text from a PDF using PyMuPDF. Works for text-based PDFs."""
    try:
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        all_text = []
        for page in doc:
            text = page.get_text()
            if text.strip():
                all_text.append(text.strip())
        doc.close()
        return "\n\n".join(all_text)
    except Exception as e:
        logger.warning(f"PyMuPDF text extraction failed: {e}")
        return ""


def _extract_text_llamabox_vision(pdf_bytes: bytes, venue_name: str) -> str:
    """Fallback: Convert PDF pages to images and send to local Llamabox vision model."""
    llamabox_base = os.getenv("LLAMABOX_URL", "http://10.50.50.203:8000/completion")
    # Derive the chat completions URL from the base URL
    chat_url = llamabox_base.rsplit("/", 1)[0] + "/v1/chat/completions"
    
    api_key = os.getenv("LLAMABOX_API_KEY", "")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        all_text = []

        # Process up to 5 pages
        for i, page in enumerate(doc):
            if i >= 5:
                break
            
            # Render page to PNG at 200 DPI
            pix = page.get_pixmap(dpi=200)
            img_bytes = pix.tobytes("png")
            img_b64 = base64.b64encode(img_bytes).decode("utf-8")

            payload = {
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{img_b64}"
                                }
                            },
                            {
                                "type": "text",
                                "text": (
                                    f"This is a menu or specials page from a venue called '{venue_name}' "
                                    f"in London, Ontario, Canada. "
                                    f"Extract all text from this image exactly as written. "
                                    f"Focus on menu items, prices, daily specials, and deals. "
                                    f"Return only the extracted text, preserving the structure."
                                )
                            }
                        ]
                    }
                ],
                "max_tokens": 4096,
                "temperature": 0.1
            }

            resp = stdlib_requests.post(chat_url, json=payload, headers=headers, timeout=900)
            resp.raise_for_status()

            result = resp.json()
            choices = result.get("choices", [])
            if choices:
                message = choices[0].get("message", {})
                text = message.get("content", "")
                if text:
                    all_text.append(text)

            logger.info(f"Llamabox Vision OCR extracted text from page {i+1} of {venue_name} PDF")

        doc.close()
        return "\n\n".join(all_text)

    except Exception as e:
        logger.error(f"Llamabox Vision OCR failed for {venue_name}: {e}")
        return ""


def find_pdf_links(html_text: str, base_url: str) -> list[str]:
    """Find all PDF links in an HTML page."""
    from urllib.parse import urljoin
    
    pdf_urls = set()
    
    # Regex for direct PDF URLs in the HTML
    for match in re.findall(r'https?://[^\s"\'<>]+\.pdf', html_text, re.IGNORECASE):
        pdf_urls.add(match)
    
    # Also check href attributes
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html_text, "html.parser")
    for a in soup.find_all("a", href=True):
        href = a.get("href", "")
        text = a.get_text().strip().lower()
        if ".pdf" in href.lower():
            pdf_urls.add(urljoin(base_url, href))
        elif any(kw in text for kw in ["download", "menu pdf", "view menu"]):
            if href and not href.startswith(("javascript:", "mailto:", "tel:")):
                pdf_urls.add(urljoin(base_url, href))
    
    return list(pdf_urls)


def extract_pdf_text(pdf_url: str, venue_name: str = "") -> str | None:
    """Main entry point: download a PDF and extract its text.
    
    Uses PyMuPDF for text-based PDFs (fast, free).
    Falls back to Gemini Vision for image-based PDFs (OCR).
    
    Returns the extracted text, or None on total failure.
    """
    logger.info(f"Downloading PDF for {venue_name}: {pdf_url}")
    pdf_bytes = _download_pdf(pdf_url)
    if not pdf_bytes:
        return None

    # Phase 1: Try PyMuPDF text extraction
    text = _extract_text_pymupdf(pdf_bytes)
    if len(text) >= TEXT_PDF_THRESHOLD:
        logger.info(f"PyMuPDF extracted {len(text)} chars from PDF for {venue_name} (text-based PDF)")
        return text[:10000]

    # Phase 2: PDF is image-based — use Llamabox Vision OCR
    logger.info(f"PDF appears image-based ({len(text)} chars from PyMuPDF). Attempting Llamabox Vision OCR...")
    vision_text = _extract_text_llamabox_vision(pdf_bytes, venue_name)
    if vision_text:
        logger.info(f"Llamabox Vision OCR extracted {len(vision_text)} chars from PDF for {venue_name}")
        return vision_text[:10000]

    logger.warning(f"All PDF extraction methods failed for {venue_name}")
    return None
