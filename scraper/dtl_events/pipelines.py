from itemadapter import ItemAdapter
from scrapy.exceptions import DropItem
from pydantic import ValidationError
from .items import DtlEventItem

class PydanticValidationPipeline:
    def process_item(self, item, spider):
        adapter = ItemAdapter(item)
        raw_data = adapter.get('raw_data')
        
        if not raw_data:
            raise DropItem("Missing data payload")

        try:
            # Validate via Pydantic
            validated_event = DtlEventItem(**raw_data)
            
            # model_dump(mode='json') automatically converts datetimes to strict ISO 8601 strings
            return validated_event.model_dump(mode='json')
            
        except ValidationError as e:
            spider.logger.error(f"Schema Validation Failed: {e.errors()}")
            raise DropItem(f"Invalid Event Data: {e}")
