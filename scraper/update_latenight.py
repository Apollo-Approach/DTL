import os
import sys
import json
import logging
sys.path.append('.')

from main import supabase

def update_late_night():
    response = supabase.table('venues').select('id, name, offerings, late_night_eligible').execute()
    venues = response.data
    
    updated = 0
    for v in venues:
        offerings_str = json.dumps(v.get('offerings', {})).lower()
        # Look for typical late night keywords
        late_night = any(k in offerings_str for k in [
            '12:00 am', '1:00 am', '2:00 am', '3:00 am', '4:00 am',
            '12:30 am', '1:30 am', '2:30 am', 'late night', 'open late',
            '12 am', '1 am', '2 am', '3 am'
        ])
        
        # Clubs and bars are usually late night
        # if v.get('type') in ['club', 'bar']:
        #     late_night = True
            
        if late_night:
            supabase.table('venues').update({'late_night_eligible': True}).eq('id', v['id']).execute()
            print(f"Set late_night_eligible=True for {v['name']}")
            updated += 1
            
    print(f"Updated {updated} venues as late night eligible.")

if __name__ == '__main__':
    update_late_night()
