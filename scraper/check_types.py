import os
import sys
import json
import logging
sys.path.append('.')

from main import supabase

def check_venues():
    response = supabase.table('venues').select('id, name, type, offerings').execute()
    venues = response.data
    
    missing = 0
    for v in venues:
        if not v.get('type'):
            missing += 1
            print(f"Missing type for: {v['name']}")
    
    print(f"Total venues missing 'type': {missing} / {len(venues)}")

if __name__ == '__main__':
    check_venues()
