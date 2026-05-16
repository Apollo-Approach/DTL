import scrapy
from datetime import datetime, timedelta, timezone
from dtl_events.items import ScrapyDtlEventItem, EventCategory
import uuid

class LondonMusicHallSpider(scrapy.Spider):
    name = 'london_music_hall'
    allowed_domains = ['londonmusichall.com']
    start_urls = ['https://londonmusichall.com/events/'] # Placeholder URL

    def parse(self, response):
        self.logger.info("Parsing London Music Hall events...")
        
        # Boilerplate mock extraction
        # In production, we will use response.css() / response.xpath()
        now_utc = datetime.now(timezone.utc)
        
        mock_raw_data = {
            "id": f"lmh-{uuid.uuid4().hex[:8]}",
            "name": "Cyberpunk Synthwave Night",
            "venue_id": "v-1",
            "location": {"type": "Point", "coordinates": [-81.2505, 42.9839]},
            "start_time": now_utc,
            "end_time": now_utc + timedelta(hours=4),
            "is_free": False,
            "price": 25.50,
            "categories": [EventCategory.LIVE_MUSIC, EventCategory.DJ_CLUB],
            "description": "A high-energy electronic music event in the heart of DTL."
        }

        yield ScrapyDtlEventItem(raw_data=mock_raw_data)
