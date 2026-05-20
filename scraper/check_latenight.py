import os
import sys
import json
import logging
sys.path.append('.')

from main import supabase

def check_venues():
    response = supabase.table('venues').select('id, name, late_night_eligible').execute()
    venues = response.data
    
    eligible = sum(1 for v in venues if v.get('late_night_eligible'))
    print(f"Late night eligible: {eligible} / {len(venues)}")

if __name__ == '__main__':
    check_venues()
