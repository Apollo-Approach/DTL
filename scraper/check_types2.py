import os
import sys
import json
import logging
sys.path.append('.')

from main import supabase

def check_venues():
    response = supabase.table('venues').select('id, name, type, offerings').execute()
    venues = response.data
    
    types = set(v.get('type') for v in venues)
    print(f"Existing types: {types}")

if __name__ == '__main__':
    check_venues()
