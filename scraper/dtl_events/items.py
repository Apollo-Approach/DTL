import scrapy
from pydantic import BaseModel, Field, field_validator, ValidationInfo
from typing import List, Tuple, Literal
from datetime import datetime
from enum import Enum

class EventCategory(str, Enum):
    LIVE_MUSIC = 'LIVE_MUSIC'
    DJ_CLUB = 'DJ_CLUB'
    DINING_DRINKS = 'DINING_DRINKS'
    ARTS_THEATRE = 'ARTS_THEATRE'
    COMMUNITY = 'COMMUNITY'
    CIVIC = 'CIVIC'

class GeoJSONPoint(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: Tuple[float, float] # [longitude, latitude]

    @field_validator('coordinates')
    @classmethod
    def validate_coordinates(cls, v):
        lon, lat = v
        if not (-180 <= lon <= 180) or not (-90 <= lat <= 90):
            raise ValueError('Invalid coordinates')
        return v

class DtlEventItem(BaseModel):
    id: str
    name: str
    venue_id: str
    location: GeoJSONPoint
    start_time: datetime 
    end_time: datetime
    is_free: bool
    price: float = Field(ge=0.0)
    categories: List[EventCategory]
    description: str

    @field_validator('price')
    @classmethod
    def validate_price(cls, v, info: ValidationInfo):
        is_free = info.data.get('is_free')
        if is_free and v > 0:
            raise ValueError('Price must be 0.0 if event is free')
        return v

class ScrapyDtlEventItem(scrapy.Item):
    # Adapter to pass raw data cleanly through Scrapy pipelines for Pydantic validation
    raw_data = scrapy.Field()
